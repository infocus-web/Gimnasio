export type BookingStatus = 'booked' | 'waitlisted' | 'canceled' | 'late_canceled' | 'checked_in' | 'no_show';
export type MembershipStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired';

export interface ClassSession {
  id: string;
  className: string;
  color: string; // color del tipo de clase (ej. #edcc36 o rgb)
  roomName: string;
  instructorName: string;
  instructorPhotoUrl?: string;
  startsAt: string; // ISO
  endsAt: string;
  capacity: number;
  spotsLeft: number;
  waitlistLeft: number;
  usesEquipment: boolean; // ej. spinning → hay que elegir bici
  myBooking?: {
    id: string;
    status: BookingStatus;
    waitlistPosition?: number | null;
    equipmentLabel?: string | null;
  };
}

export interface EquipmentSpot {
  id: string;
  label: string;
  taken: boolean;
  row: number;
  col: number;
}

export interface CheckinToken {
  token: string;
  expiresAt: string;
  refreshInSeconds: number;
}

export interface MembershipSummary {
  planName: string;
  status: MembershipStatus;
  currentPeriodEnd: string;
  creditsRemaining: number | null;
}

export interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string;
  isMe: boolean;
}

export interface PrescribedExercise {
  id: string;
  name: string;
  muscleGroup?: string;
  videoUrl?: string;
  targetSets: number;
  targetReps: string;
  targetWeightKg?: number | null;
  restSeconds: number;
  notes?: string;
}

export interface LoggedSet {
  exerciseId: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  rpe?: number;
}

export interface CheckinResult {
  found: boolean;
  allowed: boolean;
  duplicate?: boolean;
  reason?: 'QR_EXPIRED_OR_INVALID' | 'MEMBER_NOT_FOUND' | 'NO_ACTIVE_MEMBERSHIP' | 'IN_GRACE_PERIOD' | 'MEMBER_FROZEN' | null;
  member?: {
    firstName: string;
    lastName: string;
    photoUrl?: string;
    medicalNotes?: string;
  };
}

export type BookingErrorCode =
  | 'MEMBERSHIP_REQUIRED'
  | 'PAYMENT_PAST_DUE'
  | 'CLASS_FULL'
  | 'ALREADY_BOOKED'
  | 'EQUIPMENT_TAKEN'
  | 'PLAN_EXCLUDES_CLASS_TYPE'
  | 'NO_CREDITS_LEFT'
  | 'WEEKLY_LIMIT_REACHED'
  | 'BOOKING_CLOSED'
  | 'MEMBER_TIME_CONFLICT';

export interface OpeningHours {
  weekday: number; // 1 = Lunes ... 7 = Domingo (ISO)
  open: string;
  close: string;
}

export interface PeakHourSlot {
  weekday: number; // 1 = Lunes ... 7 = Domingo (ISO)
  hour: number;
  avgCheckins: number;
}
