import { toast } from "sonner";
import type { ExternalToast } from "sonner";

type ToastMessage = Parameters<typeof toast>[0];
type ToastPromiseInput<TData> = Parameters<typeof toast.promise<TData>>[0];
type ToastPromiseOptions<TData> = NonNullable<Parameters<typeof toast.promise<TData>>[1]>;

export type NotifyOptions = ExternalToast;
export type NotifyId = string | number;

export const notify = {
  success(message: ToastMessage, options?: NotifyOptions) {
    return toast.success(message, options);
  },
  error(message: ToastMessage, options?: NotifyOptions) {
    return toast.error(message, options);
  },
  info(message: ToastMessage, options?: NotifyOptions) {
    return toast.info(message, options);
  },
  warning(message: ToastMessage, options?: NotifyOptions) {
    return toast.warning(message, options);
  },
  loading(message: ToastMessage, options?: NotifyOptions) {
    return toast.loading(message, options);
  },
  promise<TData>(promise: ToastPromiseInput<TData>, labels: ToastPromiseOptions<TData>) {
    return toast.promise(promise, labels);
  },
  dismiss(id?: NotifyId) {
    return toast.dismiss(id);
  },
};
