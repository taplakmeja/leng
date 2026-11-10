import type { Card } from '@leng/engine';
import { isWild, RANK_LABEL, SUIT_SYMBOL } from '@leng/engine';

interface Props {
  card: Card;
  selected?: boolean;
  dimmed?: boolean;
  faceDown?: boolean;
  small?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  animate?: 'played' | 'dealt' | undefined;
}

export function PlayingCard({ card, selected, dimmed, faceDown, small, onClick, style, animate }: Props) {
  const classes = [
    'pcard',
    small ? 'pcard-sm' : '',
    selected ? 'pcard-selected' : '',
    dimmed ? 'pcard-dim' : '',
    faceDown ? 'pcard-back' : '',
    animate === 'played' ? 'pcard-played' : '',
    onClick ? 'pcard-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown) {
    return (
      <div className={classes} style={style} onClick={onClick} aria-label="kartu tertutup">
        <div className="pcard-back-pattern" />
      </div>
    );
  }

  const isJoker = card.suit === 'JOKER';
  const red = card.suit === 'H' || card.suit === 'D';
  const label = isJoker ? 'JOKER' : RANK_LABEL[card.rank as number] ?? '?';
  const symbol = SUIT_SYMBOL[card.suit] ?? '';

  return (
    <div
      className={classes + (red ? ' pcard-red' : isJoker ? ' pcard-joker' : '')}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={`${label} ${symbol}`}
    >
      <span className="pcard-corner pcard-tl">
        {label}
        <br />
        {symbol}
      </span>
      <span className="pcard-pip">{isJoker ? '★' : symbol}</span>
      <span className="pcard-corner pcard-br">
        {label}
        <br />
        {symbol}
      </span>
      {isWild(card) && <span className="pcard-wild-badge">WILD</span>}
    </div>
  );
}
