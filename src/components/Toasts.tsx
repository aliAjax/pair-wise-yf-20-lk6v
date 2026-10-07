import { useStore } from "../store";

export default function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast " + t.kind} onClick={() => dismissToast(t.id)}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
