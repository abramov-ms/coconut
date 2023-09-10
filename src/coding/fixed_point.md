# Числа с фиксированной точкой

Один из вриантов представления рациональных чисел &mdash; зафиксировать длину
целой и дробной части в битах. После этого дробное число можно хранить отдельно
целую, дробную часть и знак, &mdash; либо вообще все запаковать в один инт.
![Фиксированная точка](fixed_point.png)

Преимущество таких чисел &mdash; всегда будет ровно указанная точность. Поэтому
их используют, чтобы считать деньги или еще что-то важное. Однако применять их
не всегда удобно, потому что
1. Диапазон значений не очень большой. На картинке выше я потратил 16 бит на
   дробную часть и еще один бит на знак. После этого целая часть 15-битная,
   значит, число будет лежать лишь в пределах 32k по модулю. А уменьшать
   дробную часть не хочется, потому что потеряем точность.
1. В коде потребовался бы тип `decimal<N, K>` с указанием длины целой и
   дробной части. Такие типы пришлось бы везде явно прописывать и мучительно
   кастовать, если они немного не совпадают.

Поэтому хотелось бы иметь универсальный тип, который может одновременно хранить
и достаточно большие, и достаточно точные значения.