# CSS 布局

## Flexbox（一维）

```css
.container {
  display: flex;
  justify-content: center; /* 主轴 */
  align-items: center;     /* 交叉轴 */
}
```

## Grid（二维）

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
```

## 居中速查

- 水平居中：`margin: 0 auto` 或 flex `justify-content`
- 垂直居中：flex `align-items` 或 grid `place-items: center`

相关：[React要点](./React要点.md)
