# Ассемблер x86

В этом разделе поговорим про ассемблер семейства архитектур x86.

_Ассемблером (assembly language)_ называют специальный низкоуровневый язык
программирования. Он оперирует на уровне инструкций процессора и его регистров
--- ограниченного набора физических ячеек памяти, над которыми производятся
вычисления.

По неудачному стечению обстоятельств, точно также _ассемблером (assembler)_ еще
называется компилятор языка ассемблера в объектные файлы. В gcc встроен
ассемблер [as](https://linux.die.net/man/1/as), еще бывают standalone
ассемблеры, например, [nasm](https://www.nasm.us/).

В реальной жизни вы почти ничего не будете писать на ассемблере --- это гораздо
лучше делают компиляторы, --- зато его полезно уметь читать 🙂. Ассемблер ---
базовое знание, которое позволяет понимать более сложные и интересные вещи.

- Почему одни ифы ощутимо
  [замедляют](https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array)
  ваш код, а другие не влияют на производительность?
- Как написать самый быстрый [парсер](https://github.com/simdjson/simdjson)
  JSON в мире?
- Почему даже `std::unique_ptr` --- это [не
  zero-cost](https://youtu.be/rHIkrotSwcc?si=5B73a3QeQ_U3WV5q&t=1045)
  абстракция, и как это можно было бы
  [исправить](https://libcxx.llvm.org/DesignDocs/UniquePtrTrivialAbi.html).
- Из-за чего `std::endl`
  [тормозит](https://github.com/torvalds/linux/blob/master/arch/x86/entry/entry_64.S#L109)
  по сравнению с `'\n'`?
- Что такое [strict aliasing
  rule](https://gist.github.com/shafik/848ae25ee209f698763cffee272a58f8) и как
  Rust сможет 🤔 обогнать C++, имея
  [больше](https://doc.rust-lang.org/1.8.0/book/references-and-borrowing.html)
  информации об алиасинге.
- И многое другое...

Ну а пока разберемся с ассемблером!
