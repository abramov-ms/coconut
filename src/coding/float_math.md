# Арифметика флоатов

Есть два варианта реализации флоатов.
1. Hard floats --- арифметика рациональных чисел на уровне железа. В
   большинстве случаев используются именно они, т.е. логика вычислений над
   флоатами зашита напрямую в процессор либо в
   [FPU](https://en.wikipedia.org/wiki/Floating-point_unit) ---
   вспомогательный юнит для дробной арифметики.
1. Soft floats --- программная реализация флоатов, т.е. специальная
   библиотека функций, которые складывают, умножают и делят флоаты, под капотом
   используя только целочисленную арифметику. Soft float-ы нужны по двум
   причинам. Во-первых, не все архитектуры поддерживают арифметику с дробными
   числами на уровне железа. Во-вторых если и поддерживают, то возможно
   чуть-чуть по-разному. Например, могут отличаться алгоритмы деления. Поэтому
   на разных архитектурах вычисления над одними и теми же флоатами могут давать
   немного разные результаты. Чтобы получить абслютную воспроизводимость, можно
   использовать soft float-ы.

Мы посмотрим на реализацию soft float-ов в библиотеке
[compiler-rt](https://compiler-rt.llvm.org/) компилятора clang. Она содержит
санитайзеры и builtin-ы --- специальные функции, вызовы которых кланг может
неявно генерировать во время компиляции. Например функции для арифметики над
soft float-ами --- это builtin-ы. Если компилироваться под архитектуру,
которая не поддерживает дробную арифметику, то вместо сложения, умножения и
деления флоатов будут подставлены вызовы этих функций, и итоговый бинарник будет
слинкован с compiler-rt.

Исходники можно посмотреть на
[гитхабе](https://github.com/llvm/llvm-project/tree/main/compiler-rt/lib/builtins)
LLVM. Код будет сложный, но зато в нем полноценно разобраны все крайние случаи.
Нас интересуют файлики
[fp_lib.h](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_lib.h),
[fp_mul_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_mul_impl.inc),
[fp_add_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_add_impl.inc)
и
[fp_div_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_div_impl.inc).
Это только заготовки, код внутри них зависит от дефайнов. Они включаются в
итоговые файлы, в которых нужные `#define` написаны перед `#include`. Например,
для умножения

|Исходник|`#define`|Тип|
|--------|---------|---|
|[`mulsf3.c`](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/mulsf3.c)|`SINGLE_PRECISION`|`float`|
|[`muldf3.c`](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/muldf3.c)|`DOUBLE_PRECISION`|`double`|
|[`multf3.c`](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/multf3.c)|`QUAD_PRECISION`|`long double`|

Мы будем считать, что используется `#define SINGLE_PRECISION`. Вообще код уже
прокомментирован, но я прокомментирую еще раз.

## [fp_lib.h](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_lib.h)

Отсюда нам нужны следующие определения.
```c
// Это битовая маска представления float-а.
typedef uint32_t rep_t;

typedef float fp_t;

// Нужно, чтобы писать "литералы" представлений в коде. Например, REP_C(1).
#define REP_C uint32_t

// Significand - это мантисса.
#define significandBits 23

// clz означает "count leading zeros".
static __inline int rep_clz(rep_t a) { return clzsi(a); }

// 32x32 --> 64 bit multiply
//
// Это будет нужно, чтобы перемножать мантиссы. Результат умножения хранится
// по кусочкам в hi и lo. Дело в том, что rep_t может раскрываться в uint64_t
// для даблов, тогда никакой тип не сможет вместить в себя произведение.
// Придется использовать две части. Для double и long double реализация этой
// функции гораздо сложнее.
static __inline void wideMultiply(rep_t a, rep_t b, rep_t *hi, rep_t *lo) {
  const uint64_t product = (uint64_t)a * b;
  *hi = product >> 32;
  *lo = product;
}

#define typeWidth (sizeof(rep_t) * CHAR_BIT)
#define exponentBits (typeWidth - significandBits - 1)
#define maxExponent ((1 << exponentBits) - 1)
#define exponentBias (maxExponent >> 1)

// Этот бит соответствует неявному "1.", который пишем перед мантиссой в формуле.
#define implicitBit (REP_C(1) << significandBits)

#define significandMask (implicitBit - 1U)
#define signBit (REP_C(1) << (significandBits + exponentBits))
#define absMask (signBit - 1U)
#define exponentMask (absMask ^ significandMask)

// Здесь закодировано 2^(bias - bias) * 1.000...0 = 1.
#define oneRep ((rep_t)exponentBias << significandBits)

#define infRep exponentMask

// Для "тихого" NaN зарезервировали конкретный бит.
#define quietBit (implicitBit >> 1)
#define qnanRep (exponentMask | quietBit)

static __inline rep_t toRep(fp_t x) {
  const union {
    fp_t f;
    rep_t i;
  } rep = {.f = x};
  return rep.i;
}

static __inline fp_t fromRep(rep_t x) {
  const union {
    fp_t f;
    rep_t i;
  } rep = {.i = x};
  return rep.f;
}

// Это нормализация денормализованной мантиссы. Функция возвращает, какую
// степень надо прибавить к экспоненте, чтобы после нормализации получилось то
// же самое число.
static __inline int normalize(rep_t *significand) {
  const int shift = rep_clz(*significand) - rep_clz(implicitBit);
  *significand <<= shift;
  return 1 - shift;
}

static __inline void wideLeftShift(rep_t *hi, rep_t *lo, int count) {
  *hi = *hi << count | *lo >> (typeWidth - count);
  *lo = *lo << count;
}

// Sticky - это вспомогательный бит, отвечающий за округление. Мы его увидим в
// позже, но подробно обсуждать не будем.
static __inline void wideRightShiftWithSticky(rep_t *hi, rep_t *lo,
                                              unsigned int count) {
  if (count < typeWidth) {
    const bool sticky = (*lo << (typeWidth - count)) != 0;
    *lo = *hi << (typeWidth - count) | *lo >> count | sticky;
    *hi = *hi >> count;
  } else if (count < 2 * typeWidth) {
    const bool sticky = *hi << (2 * typeWidth - count) | *lo;
    *lo = *hi >> (count - typeWidth) | sticky;
    *hi = 0;
  } else {
    const bool sticky = *hi | *lo;
    *lo = sticky;
    *hi = 0;
  }
}
```

## [fp_mul_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_mul_impl.inc)

Концептуально \\( \\pm M_1eE_1 \cdot \\pm M_2eE_2 = \\pm (M_1 \cdot M_2)e(E_1 +
E_2) \\), поэтому нужно перемножить мантиссы и сложить экспоненты.

```c
static __inline fp_t __mulXf3__(fp_t a, fp_t b) {
  const unsigned int aExponent = toRep(a) >> significandBits & maxExponent;
  const unsigned int bExponent = toRep(b) >> significandBits & maxExponent;
  const rep_t productSign = (toRep(a) ^ toRep(b)) & signBit;

  rep_t aSignificand = toRep(a) & significandMask;
  rep_t bSignificand = toRep(b) & significandMask;

  // Это дополнительный сдвиг экспоненты, который может потребоваться,
  // если на вход пришли денормализованные флоаты.
  int scale = 0;

  // Detect if a or b is zero, denormal, infinity, or NaN.
  //
  // Это хак. Если экспонента нулевая, то левая часть неравенства переполнится
  // и станет максимальным uint32_t. В любом случае, в этот if мы проваливаемся,
  // если одно из чисел - специальное значение.
  if (aExponent - 1U >= maxExponent - 1U ||
      bExponent - 1U >= maxExponent - 1U) {

    // Зануляем бит знака.
    const rep_t aAbs = toRep(a) & absMask;
    const rep_t bAbs = toRep(b) & absMask;

    // NaN * anything = qNaN
    //
    // Вспомним, что Inf = [0][11...1][00..0],
    // а NaN = [0][11...1][что-то ненулевое].
    // Поэтому представление NaN > Inf.
    if (aAbs > infRep)
      // Здесь поднимают quietBit несмотря на то, что в любом случае a = NaN.
      // Это нужно на всякий пожарный для консистентности, потому что мог быть
      // выставлен другой бит мантиссы.
      return fromRep(toRep(a) | quietBit);
    // anything * NaN = qNaN
    if (bAbs > infRep)
      return fromRep(toRep(b) | quietBit);

    if (aAbs == infRep) {
      // infinity * non-zero = +/- infinity
      if (bAbs)
        return fromRep(aAbs | productSign);
      // infinity * zero = NaN
      else
        return fromRep(qnanRep);
    }

    if (bAbs == infRep) {
      // non-zero * infinity = +/- infinity
      if (aAbs)
        return fromRep(bAbs | productSign);
      // zero * infinity = NaN
      else
        return fromRep(qnanRep);
    }

    // zero * anything = +/- zero
    if (!aAbs)
      return fromRep(productSign);
    // anything * zero = +/- zero
    if (!bAbs)
      return fromRep(productSign);

    // One or both of a or b is denormal.  The other (if applicable) is a
    // normal number.  Renormalize one or both of a and b, and set scale to
    // include the necessary exponent adjustment.
    //
    // Условие ифа выполнится, если экспонента нулевая, т.к. implicit bit
    // совпадает с младшим битом экспоненты. Тогда флоат в денормализованной
    // форме. Мы нормализуем мантиссу и запоминаем, на сколько надо подкрутить
    // экспоненту.
    if (aAbs < implicitBit)
      scale += normalize(&aSignificand);
    if (bAbs < implicitBit)
      scale += normalize(&bSignificand);
  }

  // Set the implicit significand bit.  If we fell through from the
  // denormal path it was already set by normalize( ), but setting it twice
  // won't hurt anything.
  //
  // Мы будем умножать мантиссы как обычные целые числа, поэтому надо вернуть в
  // них бит, который отвечает за неявное "1.".
  aSignificand |= implicitBit;
  bSignificand |= implicitBit;

  // Perform a basic multiplication on the significands.  One of them must be
  // shifted beforehand to be aligned with the exponent.
  //
  // Обе мантиссы находятся в промежутках [1, 2), поэтому их произведение в
  // промежутке [1, 4). Это значит, что в двоичной записи перед точкой может
  // получиться два знака: 10 или 11. Надо будет нормализовать и оставить один
  // знак. После точки тоже может получиться много знаков, и их надо обрезать
  // при округлении, чтобы результат уместился в 23 бита.
  //
  // Все это можно элегантно сделать, если сдвинуть одну из мантисс влево на
  // длину экспоненты. Длина произведения мантисс будет от 24 до 48 бит, потому
  // что вместе с implicit битом длина одной мантиссы 24. Нормализацию нужно
  // проводить, если 48-ой бит произведения оказался единицей. Если сделать
  // сдвиг, то этот 48-й бит совпадет с 24-м implicit битом productHi (бит "x"
  // на картинке). А биты, попавшие в productLo, можно будет отбросить при
  // округлении, потому что они наименее значимые в произведении мантисс.
  //
  //             a                            b         
  // [знак][экспонента][мантисса] [знак][экспонента][мантисса]
  // [ 1  ][     8   x][   23   ] [ 1  ][     8    ][   23   ]
  //                 ^ 
  //                [|          24-48            ][     8    ]
  //                [x   произведение мантисс    ][   сдвиг  ]  
  // [         productHi        ] [        productLo         ]
  rep_t productHi, productLo;
  wideMultiply(aSignificand, bSignificand << exponentBits, &productHi,
               &productLo);

  // Реальное значение экспоненты, которое было бы в scientific notation -
  // это aExponent - exponentBias + bExponent - exponentBias + scale. Мы к этому
  // прибавляем exponentBias, чтобы получить смещенную экспоненту, которая
  // должна храниться в представлении флоата. Из-за scale может получиться
  // что-то меньше нуля, поэтому используем знаковый инт. Значения <= 0 будут
  // означать, что результат надо закодировать в денормализованной форме.
  int productExponent = aExponent + bExponent - exponentBias + scale;

  // Normalize the significand and adjust the exponent if needed.
  if (productHi & implicitBit)
    // Нормализация после перемножения мантисс, о которой говорили выше.
    productExponent++;
  else
    // Если ведущая "1." не вылезла в 24-й бит, она находится в 23-ем.
    // Поскольку мы всегда храним мантиссу без "1.", задвинем эту "1." в 24-й
    // бит, который принадлежит экспоненте, а попозже уберем.
    wideLeftShift(&productHi, &productLo, 1);

  // If we have overflowed the type, return +/- infinity.
  if (productExponent >= maxExponent)
    return fromRep(infRep | productSign);

  if (productExponent <= 0) {
    // The result is denormal before rounding. Все биты экспоненты будут нулями.
    //
    // If the result is so small that it just underflows to zero, return
    // zero with the appropriate sign.  Mathematically, there is no need to
    // handle this case separately, but we make it a special case to
    // simplify the shift logic.
    //
    // Минимальное "обычное" значение экспоненты - это 1. Мы хотим узнать,
    // на сколько нужно сдвинуть вправо мантиссу, чтобы экспонента стала
    // единицей. Вспомним, что -x представляется как беззнаковое 2^32 - x.
    // Учитывая, что productExponent <= 0, следующую строчку можно прочитать
    // так: 1 - (2^32 + productExponent) = 1 - productExponent (mod 2^32).
    // Это как раз нужный сдвиг.
    const unsigned int shift = REP_C(1) - (unsigned int)productExponent;
    if (shift >= typeWidth)
      return fromRep(productSign);

    // Otherwise, shift the significand of the result so that the round
    // bit is the high bit of productLo.
    wideRightShiftWithSticky(&productHi, &productLo, shift);
  } else {
    // The result is normal before rounding.  Insert the exponent.
    productHi &= significandMask;
    productHi |= (rep_t)productExponent << significandBits;
  }

  // Insert the sign of the result.
  productHi |= productSign;

  // Perform the final rounding.  The final result may overflow to infinity,
  // or underflow to zero, but those are the correct results in those cases.
  // We use the default IEEE-754 round-to-nearest, ties-to-even rounding mode.
  //
  // Здесь просто какое-то округление в зависимости от части productLo,
  // которую мы отсекаем.
  if (productLo > signBit)
    productHi++;
  if (productLo == signBit)
    productHi += productHi & 1;
  return fromRep(productHi);
}
```

## [fp_add_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_add_impl.inc)

Концептуально нужно привести экспоненты к общему виду, а потом сложить мантиссы.
Пусть \\( x = \\pm M_xeE_x \\), \\( y = \\pm M_yeE_y \\), причем \\( E_x > E_y
\\). Мы будем искать сумму в виде \\[ \\pm M_xeE_x \\pm M_yeE_y = \\pm M_xeE_x
\\pm (M_y \\cdot 2^{E_y - E_x})eE_x = (\\pm M_x \\pm M_y \\cdot 2^{E_y -
E_x})eE_x \\] При этом мантисса \\( M_y \\) потеряет некоторые биты, т.к. \\(
M_y \\cdot 2^{E_y - E_x} \\) будет соответствовать битовому сдвигу вправо.

После умножения этот код будет прочитать проще.

```c
static __inline fp_t __addXf3__(fp_t a, fp_t b) {
  rep_t aRep = toRep(a);
  rep_t bRep = toRep(b);
  const rep_t aAbs = aRep & absMask;
  const rep_t bAbs = bRep & absMask;

  // Разбираем корнер кейсы, используя те же трюки, что в умножении.
  //
  // Detect if a or b is zero, infinity, or NaN.
  if (aAbs - REP_C(1) >= infRep - REP_C(1) ||
      bAbs - REP_C(1) >= infRep - REP_C(1)) {
    // NaN + anything = qNaN
    if (aAbs > infRep)
      return fromRep(toRep(a) | quietBit);
    // anything + NaN = qNaN
    if (bAbs > infRep)
      return fromRep(toRep(b) | quietBit);

    if (aAbs == infRep) {
      // +/-infinity + -/+infinity = qNaN
      if ((toRep(a) ^ toRep(b)) == signBit)
        return fromRep(qnanRep);
      // +/-infinity + anything remaining = +/- infinity
      else
        return a;
    }

    // anything remaining + +/-infinity = +/-infinity
    if (bAbs == infRep)
      return b;

    // zero + anything = anything
    if (!aAbs) {
      // We need to get the sign right for zero + zero.
      if (!bAbs)
        return fromRep(toRep(a) & toRep(b));
      else
        return b;
    }

    // anything + zero = anything
    if (!bAbs)
      return a;
  }

  // Swap a and b if necessary so that a has the larger absolute value.
  //
  // Мы будем все приводить к большей экспоненте, поэтому надо свапать.
  // Биты экспоненты старшие, поэтому можно сравнить через представления.
  if (bAbs > aAbs) {
    const rep_t temp = aRep;
    aRep = bRep;
    bRep = temp;
  }

  // Extract the exponent and significand from the (possibly swapped) a and b.
  int aExponent = aRep >> significandBits & maxExponent;
  int bExponent = bRep >> significandBits & maxExponent;
  rep_t aSignificand = aRep & significandMask;
  rep_t bSignificand = bRep & significandMask;

  // Normalize any denormals, and adjust the exponent accordingly.
  if (aExponent == 0)
    aExponent = normalize(&aSignificand);
  if (bExponent == 0)
    bExponent = normalize(&bSignificand);

  // The sign of the result is the sign of the larger operand, a.  If they
  // have opposite signs, we are performing a subtraction.  Otherwise, we
  // perform addition.
  //
  // Да, эта функция отвечает и за сложение, и за вычитание.
  const rep_t resultSign = aRep & signBit;
  const bool subtraction = (aRep ^ bRep) & signBit;

  // Shift the significands to give us round, guard and sticky, and set the
  // implicit significand bit.  If we fell through from the denormal path it
  // was already set by normalize( ), but setting it twice won't hurt
  // anything.
  //
  // Здесь делается сдвиг, чтобы получить место для трех вспомогательных бит
  // (round, guard и sticky), которые будут нужны при округлении суммы. Мы не
  // будем вдаваться в детали округления. Здесь важно только то, что sticky
  // "запоминает", что мы отсекли от числа ненулевые биты.
  aSignificand = (aSignificand | implicitBit) << 3;
  bSignificand = (bSignificand | implicitBit) << 3;

  // Shift the significand of b by the difference in exponents, with a sticky
  // bottom bit to get rounding correct.
  //
  // Приводим оба числа к наибольшей экспоненте. Нужно сдвинуть вправо мантиссу
  // числа b.
  const unsigned int align = aExponent - bExponent;
  if (align) {
    if (align < typeWidth) {
      // bSignificand имеет биты [typeWidth - align][align], поэтому, сдвинув
      // влево на (typeWidth - align), мы получим младшие align битов. Если биты
      // ненулевые, то при сдвиге вправо на align мы их потеряем. Это надо
      // запомнить в sticky бите.
      const bool sticky = (bSignificand << (typeWidth - align)) != 0;
      bSignificand = bSignificand >> align | sticky;
    } else {
      // Если сдвиг целиком занулял мантиссу, мы просто выставляем последний
      // бит как sticky.
      bSignificand = 1; // Set the sticky bit.  b is known to be non-zero.
    }
  }
  if (subtraction) {
    aSignificand -= bSignificand;
    // If a == -b, return +zero.
    if (aSignificand == 0)
      return fromRep(0);

    // If partial cancellation occured, we need to left-shift the result
    // and adjust the exponent.
    //
    // Допустим, мантиссы 1.10101 и 1.10001, тогда разность будет
    // 0.01, и результат надо нормализовать к 1.0.
    if (aSignificand < implicitBit << 3) {
      // rep_clz() считает сколько нулей в начале двоичного числа.
      const int shift = rep_clz(aSignificand) - rep_clz(implicitBit << 3);
      aSignificand <<= shift;
      aExponent -= shift;
    }
  } else /* addition */ {
    aSignificand += bSignificand;

    // If the addition carried up, we need to right-shift the result and
    // adjust the exponent.
    // 
    // Например, 1.1 + 1.1 = 11, и это нужно нормализовать к 1.1.
    if (aSignificand & implicitBit << 4) {
      const bool sticky = aSignificand & 1;
      aSignificand = aSignificand >> 1 | sticky;
      aExponent += 1;
    }
  }

  // If we have overflowed the type, return +/- infinity.
  if (aExponent >= maxExponent)
    return fromRep(infRep | resultSign);

  if (aExponent <= 0) {
    // The result is denormal before rounding.  The exponent is zero and we
    // need to shift the significand.
    //
    // Опять же, минимальная "обычная" экспонента - это 1. Мы сдвигаем мантиссу,
    // чтобы получить такую экспоненту.
    const int shift = 1 - aExponent;
    const bool sticky = (aSignificand << (typeWidth - shift)) != 0;
    aSignificand = aSignificand >> shift | sticky;
    aExponent = 0;
  }

  // Low three bits are round, guard, and sticky.
  //
  // Эти биты регулируют округление чуть ниже.
  const int roundGuardSticky = aSignificand & 0x7;

  // Shift the significand into place, and mask off the implicit bit.
  rep_t result = aSignificand >> 3 & significandMask;

  // Insert the exponent and sign.
  result |= (rep_t)aExponent << significandBits;
  result |= resultSign;

  // Perform the final rounding.  The result may overflow to infinity, but
  // that is the correct result in that case.
  //
  // Здесь происходит округление в зависимости от настроек и трех младших
  // бит, которые мы раньше тащили с собой. Подробно разбирать это не будем.
  switch (__fe_getround()) {
  case CRT_FE_TONEAREST:
    if (roundGuardSticky > 0x4)
      result++;
    if (roundGuardSticky == 0x4)
      result += result & 1;
    break;
  case CRT_FE_DOWNWARD:
    if (resultSign && roundGuardSticky) result++;
    break;
  case CRT_FE_UPWARD:
    if (!resultSign && roundGuardSticky) result++;
    break;
  case CRT_FE_TOWARDZERO:
    break;
  }
  if (roundGuardSticky)
    __fe_raise_inexact();
  return fromRep(result);
}
```

## [fp_div_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_div_impl.inc)

Концептуально \\( \\pm M_1eE_1 \\,/\\, \\pm M_2eE_2 = \\pm (M_1 \\,/\\,
M_2)e(E_1 - E_2) \\), поэтому надо поделить мантиссы и вычесть экспоненты. На
практике делить мантиссы не так-то просто. Это можно делать, как вы писали в
задаче `BigInteger`/`Rational`. Либо можно использовать более быстрое [деление
Ньютона-Рапсона](https://en.wikipedia.org/wiki/Division_algorithm#Newton%E2%80%93Raphson_division).
Чтобы вычислить \\( x \\,/\\, y \\) сначала [методом
Ньютона](https://en.wikipedia.org/wiki/Newton%27s_method) находят \\( 1 \\,/\\,
y \\) как корень функции \\( f(t) = 1 \\,/\\, t -  y \\). Потом полученное
значение умножается на \\( x \\). В compiler-rt используется как раз этот
способ, поэтому
[fp_div_impl.inc](https://github.com/llvm/llvm-project/blob/main/compiler-rt/lib/builtins/fp_div_impl.inc)
на 80% состоит из комментария, который я не буду объяснять.
