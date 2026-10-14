import { ToastContainer } from 'react-toastify';

/**
 * Where toasts appear. One sits at the app root; <Dialog> renders another with `containerId` while it's open.
 * Toasts are announced (role="alert"), pause while hovered or focused, and can be dismissed with the close button.
 */
export function Toaster({ containerId }: { containerId?: string }) {
  return (
    <ToastContainer
      containerId={containerId}
      position="top-right"
      autoClose={8000}
      newestOnTop
      limit={3}
      closeOnClick={false}
      pauseOnHover
      pauseOnFocusLoss
      draggable={false}
      theme="light"
      className="hip-toasts"
    />
  );
}
