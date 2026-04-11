# Дизайн-стандарт — Анкета КЦ

Этот документ описывает визуальные стандарты проекта.  
Все токены объявлены в `anketa-kc/assets/tokens.css` и должны использоваться через CSS-переменные — без хардкода значений напрямую в коде.

---

## Подключение

В `index.php` токены подключаются **первыми**, до `style.css`:

```html
<link rel="stylesheet" href="./assets/tokens.css">
<link rel="stylesheet" href="./assets/style.css">
```

---

## Цвета

### Акцент (Primary)

| Переменная | Значение | Применение |
|---|---|---|
| `--color-primary` | `#007aff` | Кнопки, ссылки, активные слоты, бордюр фокуса |
| `--color-primary-hover` | `#0062cc` | Hover-состояние primary-кнопки |
| `--color-primary-active` | `#004fa3` | Active/нажатие |
| `--color-primary-light` | `rgba(0,122,255,0.12)` | Фоновое кольцо фокуса у полей ввода |
| `--color-primary-border` | `#007aff` | Бордюр незабронированного слота |

### Нейтральные

| Переменная | Значение | Применение |
|---|---|---|
| `--color-text-primary` | `#1a1a1a` | Заголовки секций (`.section-title`) |
| `--color-text-body` | `#333333` | Основной текст, значения полей |
| `--color-text-secondary` | `#555555` | Лейблы полей (`.form-label`) |
| `--color-text-muted` | `#888888` | Плейсхолдеры, вспом. текст, `.loading` |
| `--color-text-disabled` | `#aaaaaa` | Неактивные элементы |
| `--color-text-inverse` | `#ffffff` | Текст на цветном фоне (кнопки) |
| `--color-bg-page` | `#f9f9f9` | Фон `body`/iframe |
| `--color-bg-card` | `#ffffff` | Фон `.form-section` |
| `--color-bg-input` | `#ffffff` | Фон полей ввода |
| `--color-bg-btn-secondary` | `#e8e8e8` | Фон `.btn-secondary` |
| `--color-bg-btn-secondary-hover` | `#d4d4d4` | Hover `.btn-secondary` |
| `--color-border-base` | `#e0e0e0` | Бордюр карточек `.form-section` |
| `--color-border-input` | `#cccccc` | Бордюр `input`, `select`, `textarea` |
| `--color-border-divider` | `#f0f0f0` | Разделитель под `.section-title` |

### Состояния

| Переменная | Применение |
|---|---|
| `--color-success` / `--color-success-bg` / `--color-success-border` | `.success-msg`, забронированный слот |
| `--color-error` / `--color-error-bg` / `--color-error-border` | `.error-msg`, ошибки валидации |
| `--color-warning` / `--color-warning-bg` / `--color-warning-border` | Предупреждения (зарезервировано) |

> **Правило:** никогда не использовать цвета состояний как акцент и наоборот.

---

## Типографика

### Шрифт

Проект использует **системный стек** — не подгружает внешние шрифты, чтобы не замедлять iframe:

```css
font-family: var(--font-family-base);
/* -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif */
```

### Размерная шкала

| Переменная | px | Применение |
|---|---|---|
| `--font-size-xs` | 11px | Текст кнопок слотов |
| `--font-size-sm` | 12px | Лейблы полей, сообщения об ошибках/успехе, имена менеджеров |
| `--font-size-base` | 13px | Основной текст, поля ввода, кнопки |
| `--font-size-md` | 14px | Заголовки секций (`.section-title`) |
| `--font-size-lg` | 16px | Зарезервировано для крупных заголовков |

> **Минимальный размер текста — 11px.** Мельче не использовать.

### Насыщенность

| Переменная | Значение | Применение |
|---|---|---|
| `--font-weight-normal` | 400 | Обычный текст, поля |
| `--font-weight-medium` | 500 | Кнопки |
| `--font-weight-semibold` | 600 | Заголовки секций, имена менеджеров |
| `--font-weight-bold` | 700 | Зарезервировано |

---

## Отступы

Все отступы кратны **4px**.

| Переменная | px | Применение |
|---|---|---|
| `--space-1` | 4 | Минимальный зазор |
| `--space-2` | 8 | Gap в строках, между слотами |
| `--space-3` | 12 | Внутренний отступ мелких блоков |
| `--space-4` | 16 | Padding карточек, margin между секциями |
| `--space-5` | 20 | Padding кнопок по горизонтали |
| `--space-6` | 24 | Крупные внутренние отступы |
| `--space-8` | 32 | Разделение крупных блоков |

Для конкретных компонентов есть именованные токены — `--padding-card`, `--margin-section`, `--label-width` и др. Использовать их, а не `--space-*` напрямую там, где они определены.

---

## Скругления

| Переменная | px | Применение |
|---|---|---|
| `--radius-sm` | 3px | Кнопки-слоты |
| `--radius-base` | 4px | Поля ввода (`input`, `select`, `textarea`), кнопки |
| `--radius-md` | 6px | Карточки / секции формы (`.form-section`) |
| `--radius-full` | 9999px | Теги-пилюли (зарезервировано) |

---

## Тени

| Переменная | Применение |
|---|---|
| `--shadow-card` | Карточки — `none` (используется только бордюр) |
| `--shadow-focus` | Кольцо фокуса у полей ввода |
| `--shadow-popup` | Всплывающие панели, дропдауны |

---

## Анимации

| Переменная | Значение | Применение |
|---|---|---|
| `--transition-fast` | `0.12s ease` | Слоты (быстрый hover) |
| `--transition-base` | `0.15s ease` | Кнопки, поля (стандарт) |
| `--transition-medium` | `0.25s ease` | Появление блоков, раскрытие |

---

## Компоненты — правила использования токенов

### Поле ввода (input, select, textarea)

```css
border: 1px solid var(--color-border-input);
border-radius: var(--radius-base);
padding: var(--padding-input-v) var(--padding-input-h);
font-size: var(--font-size-base);
background: var(--color-bg-input);
transition: border-color var(--transition-base);

&:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}
```

### Кнопка Primary

```css
background: var(--color-primary);
color: var(--color-text-inverse);
border-radius: var(--radius-base);
padding: var(--padding-btn-v) var(--padding-btn-h);
font-size: var(--font-size-base);
font-weight: var(--font-weight-medium);
transition: background var(--transition-base);

&:hover { background: var(--color-primary-hover); }
```

### Кнопка Secondary

```css
background: var(--color-bg-btn-secondary);
color: var(--color-text-body);
/* все остальные токены — те же, что у Primary */

&:hover { background: var(--color-bg-btn-secondary-hover); }
```

### Секция формы (карточка)

```css
background: var(--color-bg-card);
border: 1px solid var(--color-border-base);
border-radius: var(--radius-md);
padding: var(--padding-card);
margin-bottom: var(--margin-section);
```

---

## Запрещённые практики

- ❌ Хардкодить цвет: `color: #007aff` — использовать `color: var(--color-primary)`
- ❌ Хардкодить отступ: `padding: 16px` — использовать `padding: var(--padding-card)`
- ❌ Добавлять новый цвет без записи в `tokens.css`
- ❌ Использовать `font-size` без ссылки на токен
- ❌ Дублировать значение токена в нескольких местах

---

## Как добавить новый токен

1. Добавить переменную в `tokens.css` в нужную группу с комментарием
2. Описать её в этом документе в соответствующей таблице
3. Использовать только через переменную

---

*Последнее обновление: апрель 2026*
