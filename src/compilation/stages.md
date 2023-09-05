# Этапы компиляции

Мы рассмотрим этапы сборки на примере программы `Hello, World!`. Компиляция
библиотек работает аналогично.
```c
// main.c

#include <stdio.h>

int main() {
  printf("Hello, World!\n");
  return 0;
}
```

Я буду использовать компилятор [`clang`](https://clang.llvm.org/). Он может
примерно то же самое, что `gcc`, и имеет практически такие же флаги командной
строки, но выдает более понятные варниги/ошибки. Плюс вокруг кланга написано
много хорошего тулинга (например,
[clang-format](https://clang.llvm.org/docs/ClangFormat.html) и
[clang-tidy](https://clang.llvm.org/extra/clang-tidy/)), поэтому я team clang.
Чтобы получить exe-шник &mdash; исполняемый файл, &mdash; нужно выполнить
команду `clang main.c -o main`.

Компиляция делится на несколько этапов, и ее можно "прервать" посередине с
помощью специальных флагов компилятора.
1. Сначала разворачиваются директивы препроцессора (`#include`, `#define`, `#ifdef` и
   другие). В нашем случае в текст программы будет целиком скопирован хедер
   `stdio.h`, и получится огромная паста. Можно посмотреть на код после препроцессинга с помощью
   команды `clang -E main.c -o main_pp.c`. Флаг `-E` говорит компилятору,
   что нужно сделать только препроцессинг и на этом остановиться. В результате у
   меня получилось [вот что](main_pp.c).
2. Потом происходит преобразование Си в инструкции ассемблера целевой платформы.
   Пока что достаточно знать, что ассемблер &mdash; просто более низкоуровневое
   описание инструкций, которые должен исполнить процессор. Посмотреть на них
   можно c помощью флага `-S`, команда `clang -S main.c -o main.S`. В этот раз
   получается файл поменьше, т.к. все неиспользуемые определения были вырезаны.
   ```x86asm
   // main.S

       .text
       .file	"main.c"
       .globl	main                            # -- Begin function main
       .p2align	4, 0x90
       .type	main,@function
   main:                                   # @main
       .cfi_startproc
   # %bb.0:
       pushq	%rbp
       .cfi_def_cfa_offset 16
       .cfi_offset %rbp, -16
       movq	%rsp, %rbp
       .cfi_def_cfa_register %rbp
       subq	$16, %rsp
       movl	$0, -4(%rbp)
       leaq	.L.str(%rip), %rdi
       movb	$0, %al
       callq	printf@PLT
       xorl	%eax, %eax
       addq	$16, %rsp
       popq	%rbp
       .cfi_def_cfa %rsp, 8
       retq
   .Lfunc_end0:
       .size	main, .Lfunc_end0-main
       .cfi_endproc
                                           # -- End function
       .type	.L.str,@object                  # @.str
       .section	.rodata.str1.1,"aMS",@progbits,1
   .L.str:
       .asciz	"Hello, World!"
       .size	.L.str, 14

       .ident	"clang version 15.0.7"
       .section	".note.GNU-stack","",@progbits
       .addrsig
       .addrsig_sym printf
   ```
3. Следующий этап &mdash; компиляция ассемблера в объектный файл,
   для этого есть флаг `-c`. После выполнения команды `clang main.c -c main.o`
   появится объектник `main.o`, он содержит настоящий машинный код. Файл
   бинарный, поэтому просто прочитать его не получится. Преобразование
   ассемблера в объектник в целом обратимо. Можно дизассемблировать `main.o` с
   помощью утилиты
   [`objdump`](https://man7.org/linux/man-pages/man1/objdump.1.html). Команда
   `objdump -d` выведет что-то такое
   ```x86asm
   main.o:     file format elf64-x86-64


   Disassembly of section .text:

   0000000000000000 <main>:
   0:	55                   	push   %rbp
   1:	48 89 e5             	mov    %rsp,%rbp
   4:	48 83 ec 10          	sub    $0x10,%rsp
   8:	c7 45 fc 00 00 00 00 	movl   $0x0,-0x4(%rbp)
   f:	48 8d 3d 00 00 00 00 	lea    0x0(%rip),%rdi        # 16 <main+0x16>
   16:	b0 00                	mov    $0x0,%al
   18:	e8 00 00 00 00       	call   1d <main+0x1d>
   1d:	31 c0                	xor    %eax,%eax
   1f:	48 83 c4 10          	add    $0x10,%rsp
   23:	5d                   	pop    %rbp
   24:	c3                   	ret
   ```
   Слева мы видим машинные коды, а справа &mdash; их мнемоники, т.е.
   ассемблерные инструкции с предыдущего шага. Инструкций стало меньше, потому
   что мы дизассемблировали только секцию `.text` &mdash; сам исполняемый код. В
   объектнике еще есть другие секции, например, секция данных, в которой
   хранится строка `"Hello, World!"`. О них мы подробнее поговорим когда
   будем изучать формат исполняемых бинарников
   [ELF](https://en.wikipedia.org/wiki/Executable_and_Linkable_Format).
4. Последний этап &mdash; линковка. Команда `clang main.o -o main` превращает
   объектный файл в итоговый exe-шник. Линковка нужна по двум причинам.
   Во-первых мог быть не один файл `main.c`, а несколько единиц трансляции, т.е.
   исходников, которые преобразуются в объектные файлы. Их все нужно совместить
   в один exe-шник, чем и занимается линковщик. Во-вторых программа могла
   использовать внешние библиотеки, как минимум, стандартную библиотеку Си. Их
   тоже нужно включить в итоговый бинарник. Линковкой обычно занимается не сам
   компилятор, а отдельная программа-линковщик. В нашем случае под капотом кланг
   запустит [`ld`](https://man7.org/linux/man-pages/man1/ld.1.html), чтобы
   получить исполняемый файл.

Код становится платформо-зависимым уже на втором шаге, когда получили ассемблер.
Ассемблерные инструкции будут разными в зависимости от архитектуры процессора и
операционной системы, для которых собираем exe-шник. Например, если
компилировать под процессоры ARM (конкретно
[AArch64](https://en.wikipedia.org/wiki/AArch64)), получится вот такой
ассемблер.
```armasm
        .arch armv8-a
        .file   "main.c"
        .text
        .section        .rodata
        .align  3
.LC0:
        .string "Hello, World!"
        .text
        .align  2
        .global main
        .type   main, %function
main:
        stp     x29, x30, [sp, -16]!
        add     x29, sp, 0
        adrp    x0, .LC0
        add     x0, x0, :lo12:.LC0
        bl      printf
        mov     w0, 0
        ldp     x29, x30, [sp], 16
        ret
        .size   main, .-main
        .ident  "GCC: (Linaro GCC 7.5-2019.12) 7.5.0"
```

Хорошая новость в том, что машинные коды практически один в один соответствуют
инструкциям ассемблера, поэтому можно считать ассемблер наиболее низкоуровневым
описанием программы. Если уметь его читать, можно рассуждать об исполнении кода
на уровне инструкций процессора.

> Такой процесс компиляции &mdash; чудовищное легаси, которое нам досталось от
> Си и перешло в C++. У современных языков этапы компиляции другие, потому что
> нет разделения кода на хедеры и исходники, а есть просто модули. Даже если
> компилировать C++20 с
> [модулями](https://en.cppreference.com/w/cpp/language/modules), уже будет
> чуть-чуть иначе. Но несмотря на это формат итогового бинарника и представление
> в ассемблере всегда одни и те же.

> Еще могут быть другие этапы сборки, если включить [link-time
> оптимизации](https://llvm.org/docs/LinkTimeOptimization.html). Вместе с LTO,
> оптимайзер одновременно видит несколько единиц трансляции и, например, может
> заинлайнить функцию из одного объектника в другой &mdash; без LTO так не
> получится. В таком случае формат объектников отличается: в них будет
> содержаться не машинный код, а специальное промежуточное представление, с
> которым работает оптимайзер, &mdash; например, [биткод
> LLVM](https://llvm.org/docs/BitCodeFormat.html).
