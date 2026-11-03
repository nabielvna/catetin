export async function Resolve<T>({ value, children }: { value: Promise<T>; children: (value: T) => React.ReactNode }) {
  return children(await value);
}
