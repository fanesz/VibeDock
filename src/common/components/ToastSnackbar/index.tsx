import { Toaster } from "sonner";
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiLoader, FiXCircle } from "react-icons/fi";

const iconClassName = "h-4 w-4 shrink-0";

export default function ToastSnackbar() {
  return (
    <Toaster
      closeButton
      theme="dark"
      richColors={false}
      position="top-right"
      visibleToasts={4}
      gap={8}
      offset={{ top: 44, right: 16 }}
      mobileOffset={{ top: 44, right: 12, left: 12 }}
      containerAriaLabel="Notifications"
      style={{ ["--width" as string]: "320px" }}
      icons={{
        success: <FiCheckCircle aria-hidden="true" className={`${iconClassName} text-emerald-400`} />,
        info: <FiInfo aria-hidden="true" className={`${iconClassName} text-sky-400`} />,
        warning: <FiAlertTriangle aria-hidden="true" className={`${iconClassName} text-amber-400`} />,
        error: <FiXCircle aria-hidden="true" className={`${iconClassName} text-rose-400`} />,
        loading: <FiLoader aria-hidden="true" className={`${iconClassName} animate-spin text-zinc-400`} />,
      }}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 shadow-xl",
          title: "text-xs font-semibold leading-4 text-zinc-100",
          description: "mt-0.5 text-xs leading-4 text-zinc-400",
          content: "gap-0.5",
          icon: "mr-1.5",
          closeButton:
            "border border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100",
          actionButton:
            "rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500",
          cancelButton:
            "rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700",
          success: "border-l-2 border-l-emerald-500",
          info: "border-l-2 border-l-sky-500",
          warning: "border-l-2 border-l-amber-500",
          error: "border-l-2 border-l-rose-500",
          loading: "border-l-2 border-l-zinc-500",
        },
      }}
    />
  );
}
