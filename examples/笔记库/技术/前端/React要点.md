# React 要点

## Hooks

| Hook | 用途 |
|------|------|
| `useState` | 组件内状态 |
| `useEffect` | 副作用 |
| `useRef` | 引用可变值，不触发重渲染 |
| `useMemo` | 缓存计算结果 |

## 自定义 Hook

把状态逻辑抽成可复用函数：

```ts
function useToggle(initial = false) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn(!on)] as const;
}
```

## 性能优化

- `React.memo` 避免子组件不必要重渲染
- `useCallback` 稳定传给子组件的回调

相关：[CSS布局](./CSS布局.md)
