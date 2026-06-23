import { toast as t } from "sonner";

export const toast = {
  success: (m: string) => t.success(m),
  error: (m: string) => t.error(m),
  loading: (m: string) => t.loading(m),
  dismiss: t.dismiss,
};
