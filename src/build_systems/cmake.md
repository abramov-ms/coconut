# CMake

Писать вручную сборочные скрипты все еще неудобно, потому что нужно самому
придумывать зависимости между таргетами и указывать очень длинные команды
компиляции. Легко ошибиться, в итоге иногда билд будет разламываться по
непонятным причинам. К тому же, если в качестве билд-системы выбрать что-то
кроме ниндзи, скорее всего получится не кроссплатформенно.

Чтобы решить эти проблемы, были придуманы генераторы сборочных скриптов,
например достаточно древний
[Autotools](https://en.wikipedia.org/wiki/GNU_Autotools) и более новый
[CMake](https://cmake.org/). Симейк сам по себе ничего не собирает, а только
пишет скрипты какой-то сборочной системы, например мейкфайлы. Он заточен в
основном под C/C++ и способен генерировать достаточно сложный код сборки. После
генерации за билд целиком отвечает "бакенд" --- мейк, ниндзя, MSBuild или
что-то еще.

Допустим, дерево проекта такое.

```
.
├── aplusb.c
├── aplusb.h
├── CMakeLists.txt
└── main.c

1 directory, 4 files
```

Тогда вот минимальный скрипт симейка --- высокоуровневое описание сборки.

```c
# CMakeLists.txt

cmake_minimum_required(VERSION 3.27)

project(coconut C)

add_library(aplusb SHARED aplusb.c aplusb.h)

add_executable(main main.c)
target_link_libraries(main PRIVATE aplusb)
```

Здесь объявляются два таргета: executable `main` и динамическая библиотека
`aplusb`, к которой он линкуется. Сначала нужно сгенерировать сборочные скрипты
"бакенда", которые описывают, какие конкретно шаги происходят при билде. Этот этап
называется конфигурированием проекта.

```bash
mkdir build
cd build
cmake .. -G Ninja
```

Здесь `..` --- путь до директории, содержащей `CMakeLists.txt`, а флаг `-G`
указывает симейку, какой _генератор_ использовать. Генератор --- компонент
симейка, который и пишет сборочные скрипты конкретной билд-системы, в нашем случае
--- скрипты ниндзи. После генерации дерево проекта будет таким.

```
.
├── aplusb.c
├── aplusb.h
├── build
│   ├── build.ninja
│   ├── CMakeCache.txt
│   ├── CMakeFiles
│   │   ├── 3.27.1
│   │   │   ├── CMakeCCompiler.cmake
│   │   │   ├── CMakeDetermineCompilerABI_C.bin
│   │   │   ├── CMakeSystem.cmake
│   │   │   └── CompilerIdC
│   │   │       ├── a.out
│   │   │       ├── CMakeCCompilerId.c
│   │   │       └── tmp
│   │   ├── aplusb.dir
│   │   ├── cmake.check_cache
│   │   ├── CMakeConfigureLog.yaml
│   │   ├── CMakeScratch
│   │   ├── main.dir
│   │   ├── pkgRedirects
│   │   ├── rules.ninja
│   │   └── TargetDirectories.txt
│   └── cmake_install.cmake
├── CMakeLists.txt
└── main.c

10 directories, 16 files
```

Появился файл [`build.ninja`](build.ninja), в котором описан процесс сборки.
Формат ниндзи похож на мейкфайлы, но с некоторыми дополнительными фичами. Он
изначально дизайнился для того, чтобы его генерировала система типа симейка, а
не писал вручную разработчик. Поэтому скрипт обфусцированный и не очень
читаемый.

Чтобы собрать проект, нужно выполнить `cmake --build .` в директории `build/`.
Напрямую запускать ниндзю или другую билд-систему не надо, это гораздо лучше
сделает сам симейк. Можно было бы выполнить генерацию командой `cmake .. -G
'Unix Makefiles'`. Тогда получился бы вот такой [`Makefile`](Makefile), и
сборку выполнял бы мейк.

# Опции

У симейка есть переменные, влияющие на билд. Их можно задавать в скриптах
либо передавать в аргументах командной строки. Наиболее полезные
1. [`CMAKE_BUILD_TYPE`](https://cmake.org/cmake/help/latest/variable/CMAKE_BUILD_TYPE.html)
   --- тип сборки: `Debug`, `Release`, `MinSizeRel` или `RelWithDebInfo`. В
   зависимости от этой опции будут включены дебаг-символы и выбран уровень
   оптимизации.
1. [`CMAKE_C_COMPILER`](https://cmake.org/cmake/help/latest/variable/CMAKE_LANG_COMPILER.html)
   --- путь до компилятора Си. Если его не указать, то симейк попытается
   найти компилятор сам, но возможно сделает это неправильно.
1. [`CMAKE_C_FLAGS`](https://cmake.org/cmake/help/latest/variable/CMAKE_LANG_FLAGS.html)
   --- опции компиляции, которые добавляются к каждому запуску компилятора и
   линковщика.

Научимся включать ASan через симейк. Нам нужно пробросить в сборку флаг
`-fsanitize=address` через переменную `CMAKE_C_FLAGS`.

```c
# CMakeLists.txt

cmake_minimum_required(VERSION 3.27)

project(coconut C)

option(COCONUT_ASAN "Enable AddressSanitizer" OFF)
if(ASAN)
  message(STATUS "Sanitize with AddressSanitizer")
  set(CMAKE_C_FLAGS -fsanitize=address)
endif()

add_library(aplusb SHARED aplusb.c aplusb.h)

add_executable(main main.c)
target_link_libraries(main PRIVATE aplusb)

```
Функция `option()` объявляет переменную, которую потом можно передать в
командной строке. По умолчанию ASan будет выключен. Чтобы его включить, надо
поднять флаг опцией `-DCOCONUT_ASAN=ON`.

```bash
mkdir build_asan
cd build_asan
cmake .. -G Ninja -DCOCONUT_ASAN=ON
cmake --build .
```

После этого в папке `build_asan/` будет лежать сборка с санитайзером.

# Пресеты

Каждый раз вручную конфигурировать проект симейком не очень удобно. Нужно
передавать флаги `CMAKE_C_COMPILER` и `CMAKE_BUILD_TYPE`, указывать генератор и
создавать папку для билда. Чтобы упростить конфигурирование, придумали
[пресеты](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html) --
формат описания аргументов, с которыми вызывается `cmake`.

Пресеты описываются в файле `CMakePresets.json`. Например, он может быть таким.

```json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "ninja",
      "hidden": true,
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build/${presetName}",
      "cacheVariables": {
        "CMAKE_C_COMPILER": "clang"
      }
    },
    {
      "name": "debug",
      "displayName": "Debug",
      "inherits": [
        "ninja"
      ],
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug"
      }
    },
    {
      "name": "release",
      "displayName": "Release",
      "inherits": [
        "ninja"
      ],
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release"
      }
    },
    {
      "name": "asan",
      "displayName": "ASan",
      "inherits": "debug",
      "cacheVariables": {
        "ASAN": "ON"
      }
    }
  ]
}
```

Каждый объект из `configurePresets` транслируется в вызов симейка с
определенными флагами. В пресете могут быть указаны переменные --- `cacheVariables`,
генератор и папка билда `binaryDir`. Еще пресеты могут наследоваться, в нашем
случае по такой схеме.

```
ninja
├── debug
│   └── asan
└── release
```

Использовать пресет `asan` можно командой `cmake . --preset asan`. Симейк
прочитает его из `.json` файла и сконвертирует в длинную команду `cmake
-S . -B build/asan/ -G Ninja -DCMAKE_C_COMPILER=clang -DASAN=ON`. После этого в
папке `build/asan/` появятся скрипты ниндзи для билда с санитайзером.

Пресеты еще удобны тем, что их хорошо понимают IDE, например,
[плагин](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cmake-tools)
симейка для VSCode. Можно просто сказать "нужна сборка `asan`", и будет проведен
билд с нужными флагами.
