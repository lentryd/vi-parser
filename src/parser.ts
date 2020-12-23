import { default as fetch, Response, RequestInit } from 'node-fetch';
import { parserAppContext, UserInfo, parseUserInfo, Subject, parseSubject, Journal, parseJournal, Birthday, parseBirthday } from './html-parsers';
import { Studentgrades, DiaryWeek, Assignment, reportFile, Announcement, AssignmentTypes, md5, FetchError } from './helpers';

/** Parser for SGO */
export default class Parser {
  private _host: string;
  private _login: string;
  private _password: string;
  private _ttslogin: string;

  protected _at: string;
  protected _ver: string;
  private _cookie: object;
  private _secure: boolean;
  private _sessionTime: number;

  private _userId: number;
  protected _yearId: string;
  private _classId: number;
  private _skoolId: string;
  private _currYear: string;
  private _serverId: string;
  protected _skoolName: string;
  private _timeFormat: string;
  protected _dateFormat: string;
  protected _serverTimeZone: number;

  public subjects: { id: string, name: string }[];
  public studyYear: { start: Date, end: Date };


  /**
   * Initializing the parser.
   * @param host Domain of SGO
   * @param login Login for authorization
   * @param password Password for authorization
   * @param ttslogin Ttslogin for authorization
   */
  constructor(host: string, login: string, password: string, ttslogin: string) {
    this._host = host;
    this._login = login;
    this._password = password;
    this._ttslogin = ttslogin;

    this._at = null;
    this._ver = null;
    this._cookie = {};
    this._secure = true;
    this._sessionTime = null;

    this._userId = null;
    this._yearId = null;
    this._classId = null;
    this._skoolId = null;
    this._currYear = null;
    this._serverId = null;
    this._skoolName = null;
    this._timeFormat = null;
    this._dateFormat = null;
    this._serverTimeZone = null;

    this.subjects = [];
    this.studyYear = { start: null, end: null };
  }


  /** Host for this parser */
  protected get host():string {
    return `http${this._secure ? 's' : ''}://${this._host}`;
  }
  
  /** Cookie for this parser */
  private get cookie():string {
    let str = '';
    for (const key in this._cookie) {
      if (!this._cookie[key]) continue;
      if (str != '') str += '; ';
      str += key + '=' + this._cookie[key];
    }
    return str;
  }

  /** Headers for this parser */
  protected get headers() {
    return {
      'host': this._host,
      'cookie': this.cookie,
      'referer': this.host,
      'content-type': 'application/x-www-form-urlencoded',
      'x-requested-with': 'xmlhttprequest',
    };
  }

  /** Whether authorization is required for this parser */
  get needAuth():boolean {
    return !this._at || !this._ver || this._sessionTime - Date.now() < 1000;
  }

  /**
   * Request to the server for this parser
   * @param url Relative pathname
   * @param params Request params
   */
  protected fetch(url: string, params?: RequestInit):Promise<Response> {
    return fetch(
      this.host + url,
      {
        ...params,
        headers: {
          ...this.headers,
          ...params?.headers
        }
      }
    )
        .then(res => {
          if (!res.ok) throw new FetchError(res);
          else return this.saveCookie(res);
        })
  }

  /**
   * Saving of cookie for this parser
   * @param res Server response
   */
  private saveCookie(res: Response):Response {
    const cookies = res.headers.get('set-cookie')
        ?.replace?.(/expires=.+?;/g, '')
        ?.split?.(', ');
  
    for (const c of cookies ?? []) {
      const [, name, value] = c.match(/^(.+?)=(.+?)(?=;|$)/) || [];
      if (!name || !value) continue;
      this._cookie[name] = value;
    }
    return res;
  }

  /** Сheck the dates */
  private checkDates(...dates: Date[]):boolean {
    for (let date of dates) {
      if (
        date < this.studyYear.start ||
        date > this.studyYear.end ||
        date.toJSON() == null
      ) {
        return false;
      }
    }
    return true;
  }

  /** Log in SGO */
  public logIn():Promise<void> {
    return this.fetch('')
      .then(res => this._secure = res.url.startsWith('https'))
      .then(() => this.fetch('/webapi/auth/getdata', { method: 'post' }))
      .then(res => res.json())
      .then(({lt, ver, salt}) => {
        this._ver = ver;
        const password = md5(salt + md5(this._password));
        const body = (
          `lt=${lt}&` +
          `ver=${ver}&` +
          `pw2=${password}&` +
          `UN=${encodeURI(this._login)}&` +
          `PW=${password.substring(0, this._password.length)}&` +
          `LoginType=1&` +
          this._ttslogin
        );

        return this.fetch('/webapi/login', {method: 'post', body});
      })
      .then(res => res.json())
      .then(({at, timeOut}) => {
        this._at = at;
        this._sessionTime = Date.now() + timeOut;
        if (!this._userId) return this.appContext();
      })
      .then(() => void 0);
  }

  /** Log out SGO*/
  public logOut():Promise<void> {
    return this.fetch(
        '/asp/logout.asp',
        {
          method: 'post',
          body: (
            `at=${this._at}&` +
            `ver=${this._ver}`
          ),
        },
    )
        .then(() => {
          this._at = null;
          this._ver = null;
          this._sessionTime = null;
        });
  }

  /** Save application context */
  private appContext():Promise<void> {
    return this.fetch(
        `/asp/MySettings/MySettings.asp?at=${this._at}`,
        {
          method: 'post',
          body: (
            `at=${this._at}&` +
            `ver=${this._ver}&`
          )
        }
    )
      .then(res => res.text())
      .then(parserAppContext)
      .then(ctx => {
        this._at = ctx.at;
        this._ver = ctx.ver;
        this._yearId = ctx.yearId;
        this._skoolId = ctx.schoolId;
        this._currYear = ctx.currYear;
        this._skoolName = ctx.fullSchoolName;
        this._dateFormat = ctx.dateFormat;
        this._timeFormat = ctx.timeFormat;
        this._serverTimeZone = ctx.serverTimeZone;
        return this.fetch(
            '/webapi/reports/studentgrades',
            {
              headers: {
                at: this._at
              }
            }
        );
      })
      .then(res => res.json())
      .then((data: Studentgrades) => {
        const filterSources = data.filterSources;
        const userId = filterSources.find(f => f.filterId == 'SID');
        const classId =filterSources.find(f => f.filterId == 'PCLID_IUP');
        const subjects = filterSources.find(f => f.filterId == 'SGID');
        const range = filterSources.find(f => f.filterId == 'period');

        this._userId =  parseInt(userId.defaultValue);
        this._classId =  parseInt(classId.defaultValue);
        this.subjects = subjects.items.map(s => ({id: s.value, name: s.title}));
        this.studyYear.start = new Date(range.defaultRange.start);
        this.studyYear.end = new Date(range.defaultRange.end);
      })
  }

  /** Returns thr user's information */
  public userInfo():Promise<UserInfo> {
    return this.fetch(
        `/asp/MySettings/MySettings.asp?at=${this._at}`,
        {
          method: 'post',
          body: (
            `at: ${this._at}` +
            `ver: ${this._ver}`
          ),
        },
    )
        .then(res => res.text())
        .then(parseUserInfo)
  }

  /** Returns the user's photo */
  public userPhoto():Promise<Buffer> {
    return this.fetch(
      `/webapi/users/photo` +
          `?AT=${this._at}` +
          `&VER=${this._ver}` +
          `&userId=${this._userId}`
    )
        .then(res => res.buffer());
  }

  /** Returns diary */
  public diary(start: Date, end: Date):Promise<DiaryWeek> {
    if (!this.checkDates(start, end)) {
      throw new Error(`The start and end values is not valid.`);
    }
    if (end.getTime() - start.getTime() < 8.64e7) {
      throw new Error(`The interval should be more than a day.`)
    }

    return this.fetch(
        '/webapi/student/diary' +
          `?vers=${this._ver}` +
          `&yearId=${this._yearId}` +
          `&weekEnd=${end.toJSON()}` +
          `&studentId=${this._userId}` +
          `&weekStart=${start.toJSON()}`,
          {
            headers: { at: this._at }
          }
    )
        .then(res => res.json());
  }

  /** Returns subject */
  public subject(id: string | number, start: Date, end: Date): Promise<Subject> {
    if (!this.subjects.find(s => s.id == id)) {
      throw new Error(`The id value is not valid.`)
    }
    if (!this.checkDates(start, end)) {
      throw new Error(`The start and end values is not valid.`);
    }

    return reportFile.call(
      this,
      '/webapi/reports/studentgrades/queue',
      [
        {
          filterId: 'SID',
          filterValue: this._userId,
        },
        {
          filterId: 'PCLID_IUP',
          filterValue: this._classId + '_0',
        },
        {
          filterId: 'SGID',
          filterValue: id,
        },
        {
          filterId: 'period',
          filterValue: start.toJSON() + ' - ' + end.toJSON(),
        },
      ]
    )
      .then(parseSubject);
  }

  /** Returns journal */
  public journal(start: Date, end: Date): Promise<Journal> {
    if (!this.checkDates(start, end)) {
      throw new Error(`The start and end values is not valid.`);
    }

    return reportFile.call(
      this,
      '/webapi/reports/studenttotal/queue',
      [
        {
          filterId: 'SID',
          filterValue: this._userId,
        },
        {
          filterId: 'PCLID',
          filterValue: this._classId,
        },
        {
          filterId: 'period',
          filterValue: start.toJSON() + ' - ' + end.toJSON(),
        },
      ]
    )
      .then(parseJournal);
  }

  /** Returns birthday boys of the month */
  public birthdays(date: Date, withoutParens = true): Promise<Birthday> {
    if (!this.checkDates(date)) {
      throw new Error(`The date values is not valid.`);
    }

    return this.fetch(
      '/asp/Calendar/MonthBirth.asp',
      {
        method: 'post',
        body: (
          `AT=${this._at}&` +
          `VER=${this._ver}&` +
          `Year=${date.getFullYear()}&` +
          `Month=${date.getMonth() + 1}&` +
          `PCLID=${this._classId}&` +
          `ViewType=1&` +
          `LoginType=0&` +
          `BIRTH_STAFF=1&` +
          `BIRTH_PARENT=${withoutParens ? 0 : 4}&` +
          `BIRTH_STUDENT=2&` +
          `From_MonthBirth=1&` +
          `MonthYear=${date.getMonth() + 1 + ',' + date.getFullYear()}`
        )
      },
  )
    .then(res => res.text())
    .then(parseBirthday);
  }

  /** Returns information about the assignment */
  public assignment(id: number):Promise<Assignment> {
    return this.fetch(
      `/webapi/student/diary/assigns/${id}?studentId=${this._userId}`,
      { headers: { at: this._at } }
    )
      .then(res => res.json())
  }

  /** Returns announcements */
  public announcements():Promise<Announcement[]> {
    return this.fetch(
        '/webapi/announcements?take=-1',
        {
          headers: { at: this._at }
        }
    )
          .then(res => res.json());
  }

  /** Returns assignment types */
  public assignmentTypes():Promise<AssignmentTypes[]> {
    return this.fetch('/webapi/grade/assignment/types')
        .then(res => res.json());
  }

  /** Returns count of unread messages */
  public unreadedMessages():Promise<Number> {
    return this.fetch(
        '/webapi/mail/messages/unreaded',
        {
          headers: { at: this._at }
        }
    )
        .then(res => res.json());
  }
}
