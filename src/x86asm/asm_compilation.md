# Компиляция в ассемблер

Для компилируемых языков программирования ассемблер --- одно из промежуточных
представлений кода при сборке исполняемого бинарника. В случае Cи можно
увидеть, в какой ассемблер транслируется программа, передав компилятору флаг
`-S`.

Скомпилируем этот код в ассемблер.

```c
// aplusb.c

void aplusb(int a, int b) {
  return a + b;
}
```

Традиционно ассемблерные файлы имеют расширение `.S`, иногда еще бывает
маленькая `.s`. Отличаеюся они только тем, что в `.S`-файлах можно использовать
макросы препроцессора (`#include`, `#define` и другие), а в `.s` --- нельзя.

Исторически сложилось два диалекта ассемблера x86 --- Intel и AT&T.
Документация и примеры кода по большей части пишутcя в диалекте Intel, он
считается более удобным. Тем не менее, в дикой природе чаще можно увидеть
диалект AT&T 🤷. Его мы обсудим позже, а пока что поднимем флаг `-masm=intel`.

```bash
gcc aplusb.c -masm=intel -S -O2 -o aplusb.S
```

Полученный файл выглядит так.

```x86asm
// aplusb.S

	.file	"aplusb.c"
	.intel_syntax noprefix
	.text
	.p2align 4
	.globl	aplusb
	.type	aplusb, @function
aplusb:
.LFB0:
	.cfi_startproc
	lea	eax, [rdi+rsi]
	ret
	.cfi_endproc
.LFE0:
	.size	aplusb, .-aplusb
	.ident	"GCC: (GNU) 14.2.1 20240910"
	.section	.note.GNU-stack,"",@progbits
```

В коде можно выделить три основных компонента.

- Метки (`aplusb`, `.LFB0`, `.LFE1`). Они ставятся перед функциями,
  вспомогательными кусочками кода, объявлениями констант и глобальных
  переменных. На метки можно ссылаться в ассемблерном коде. Например, прыгнуть
  на метку с помощью инструкции [`jmp`](https://www.felixcloutier.com/x86/jmp)
  --- ассемблерного аналога `goto` из Си.
- Инструкции (`lea`, `ret`). Это "атомарные" действия, которые исполняет
  процессор. Они могут оперировать над регистрами (`rdi`, `rsi`, `eax`),
  константами или обращаться в память.
- Служебные директивы (`.text`, `.globl`, `.section`). В основном они влияют на
  настройки синтаксиса ассемблера и структуру итогового бинарника. Например,
  `.ident	"GCC: (GNU) 14.2.1 20240910"` говорит, что в бинарник нужно
  вкомпилировать такой "комментарий" с указанием версии gcc. А `.globl aplusb`
  _экспортирует_ функцию --- без этой директивы она была бы не видна при
  линковке.

# `objdump`

Инструкции на языке ассемблера практически один в один соответствуют машинным
кодам, поэтому бинарные файлы можно _дизассемблировать_  --- получить по
бинарнику код на языке ассемблера. Мы будем это делать с помощью утилиты
[`objdump`](https://linux.die.net/man/1/objdump). Флаг `-d` означает
"disassemble", `-M` задает диалект ассемблера.

```bash
gcc aplusb.c -c -o aplusb.o
objdump -d -M intel aplusb
```

Вывод похож на то, что уже видели выше.

```x86asm
aplusb.o:     file format elf64-x86-64


Disassembly of section .text:

0000000000000000 <aplusb>:
   0:   8d 04 37                lea    eax,[rdi+rsi*1]
   3:   c3                      ret
```

Слева записаны _опкоды_ --- байты, которыми кодируются инструкции, а справа их
_мнемоники_ --- человекочитаемые (если честно, не очень) названия. Одни и те же
инструкции могут кодироваться разными мнемониками. В нашем дизассемблере
по-другому стал выглядеть вызов [`lea`](https://www.felixcloutier.com/x86/lea).

При компиляции также вырезаются метки, которые начинались с `.L`. Считается,
что они служебные --- обычно под ними записываются разные ветки `if` или тело
цикла. В итоговом бинарнике у них нет названий, есть только числовые адреса. 

# Godbolt

Иногда вместо `objdump` удобнее использовать [godbolt](https://godbolt.org/)
--- инструмент для анализа компиляторов, названный по фамилии
[автора](https://github.com/mattgodbolt). Godbolt фильтрует ассемблерный код и
показыват только те инструкции, которые относятся к вашим исходникам. Еще он
умеет подсвечивать, в какие именно инструкции развернулась каждая строчка кода. 

Хороший способ научиться программировать на ассемблере --- попробовать что-то
написать на Си, а потом посмотреть через godbolt, какие сгенерировались
инструкции 😊.
