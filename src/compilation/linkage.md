# Статическая и динамическая линковка

Если исполняемый файл линкуется к динамическим библиотекам, это не всегда
удобно. Такие библиотеки надо везде носить с собой и подкладывать в папки,
которые прописаны в `rpath`. Даже libc на разных системах может лежать в разных
директориях и иметь несовместимые версии. Поэтому если вы скомпилируете
программу у себя на компьютере а потом перекопируете на другую машину, не факт,
что она запустится, т.к. могут не найтись нужные `.so`.

Плюс некоторые программы, например линковщик `linux-ld.so`, не могут зависеть от
динамических библиотек, т.к. сами их реализуют. Поэтому бывают статически
слинкованные бинарники, т.е. не зависящие ни от каких динамических либ.

Попробуем избавиться от рантаймовых зависимостей в нашем `Hello, World!`. Для
статической линковки надо передать клангу флаг `-static`.
```bash
clang main.c -static -o main
```
При сборке кланг использовал статические варианты библиотек, от которых зависел
`Hello, World!`, например `libc.a` (библиотеки могут быть установлены сразу в
двух вариантах &mdash; и `.so`, и `.a`). Теперь если попробовать `ldd main`,
получим сообщение `not a dynamic executable`. Статически слинкованная программа
не использует `ld-linux.so`, т.к. все зависимости уже и так вкомпилированы в
нее. Она будет работать на любой машине с совместимой архитектурой процессора и
операционной системой.
