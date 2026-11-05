export function reservationUpdate(gift, status, uid) {
  if (!uid) throw new Error('auth-required');
  if (status === 'reserved' && gift.status === 'available' && !gift.reservedBy) {
    return {status, reservedBy: uid};
  }
  if (status === 'available' && gift.status === 'reserved' && gift.reservedBy === uid) {
    return {status, reservedBy: null};
  }
  throw new Error('status-conflict');
}

export const ownsReservation = (gift, uid) => Boolean(uid && gift.status === 'reserved' && gift.reservedBy === uid);
