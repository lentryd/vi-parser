# Vi Sgo

Этот модуль в основном представляет собой класс, который предоставляет общие механизмы для взаимодействия с [Сетевым Городом](https://www.ir-tech.ru/?products=ais-setevoj-gorod-obrazovanie). Пример работы модуля скоро можно будет увидеть.

## Пример использования

```javascript
const Parser = require("vi-sgo").Parser;
const user = new Parser("<host>", "<login>", "<password>", "<ttslogin>");

user
  .logIn()
  .then(() => user.userInfo())
  .then(console.log);

// Вам не нужно выходить из системы, если это необходимо, модуль сделает это за вас.
```

## Типы парсера

### Parser

Это оригинальный парсер. В нем нет контроля запрос и это может вызывать дублирование одного и того же запроса, как это показано ниже.

```javascript
const Parser = require("vi-sgo").Parser;
const user = new Parser("<host>", "<login>", "<password>", "<ttslogin>");

user.logIn(); // Создаем процесс авторизации
user.logIn(); // Создаем еще один процесс авторизации
// В результате этих действий вход в систему будет выполнен дважды, но будет использоваться только последняя авотризация
```

### Protect (рекомендуется)

Это парсер проксирует основные функции и следит за их выполнением. В результате этого, процессы с одинаковыми данными не повторяются.

```javascript
const Parser = require("vi-sgo").Protect;
const user = new Parser("<host>", "<login>", "<password>", "<ttslogin>");

user.logIn(); // Создаем процесс авторизации
user.logIn(); // Ссылаемся на уже ранее созданный процесс
// В результате этих действий вход в систему будет выполнен один раз
```

Отслеживание одинаковых процессор осуществляется путем сравнения переданных значений. То есть вы можете специально продублировать процесс передав дополнительный параметр.

```javascript
const Parser = require("vi-sgo").Protect;
const user = new Parser("<host>", "<login>", "<password>", "<ttslogin>");

user.logIn(); // Создаем процесс авторизации
user.logIn(1); // Создаем еще один процесс авторизации
// В результате этих действий вход в систему будет выполнен дважды
```

## Стоит прочитать

- [API Документация](https://github.com/lentryd/vi-sgo/blob/main/docs/api.md)
