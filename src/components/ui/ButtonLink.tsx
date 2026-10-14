import { Link, type LinkProps } from 'react-router-dom';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './buttonStyles';

/** A router link styled as a button. Use it instead of wrapping <Button> in <Link> (no nested interactive elements). */
export function ButtonLink({ variant, size, block, className, ...props }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <Link className={buttonClasses({ variant, size, block, className })} {...props} />;
}
