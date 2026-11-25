type Props = {
  value: bigint;
  className?: string;
};

/**
 * Renders a gameplay value exactly (never through `number`), shrinking
 * the font — not the touch target — as digit counts grow.
 */
export function NumberLabel({ value, className }: Props) {
  const text = value.toString();
  const classes = ['number'];

  if (text.length >= 7) classes.push('number--huge');
  else if (text.length >= 5) classes.push('number--wide');

  if (className) classes.push(className);

  return <span className={classes.join(' ')}>{text}</span>;
}
