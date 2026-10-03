import { money } from '@php/pricing';
import type { VendorViewInput } from '../../data/vendor';
import type { Palette } from '../../theme/tokens';

/** How a request looks from the signed-in vendor's side. */
export function vendorView(r: VendorViewInput, c: Palette) {
  const mine = r.myBid;
  const booked = r.status === 'booked';
  const won = booked && mine != null && r.bookedBidId === mine.id;
  const lost = booked && !won;
  const closed = r.status !== 'open';
  return {
    hasMine: mine != null,
    won,
    closed,
    myPrice: mine ? money(mine.price) : '',
    status: won ? 'Won · scheduled' : lost ? 'Not selected' : mine ? 'Quote sent' : 'New request',
    color: won ? c.status.forest : lost ? c.muted : mine ? c.status.slate : c.accent,
    bidsTxt: `${r.bidCount} bid${r.bidCount === 1 ? '' : 's'} so far${closed ? ' · closed' : ''}`,
  };
}
