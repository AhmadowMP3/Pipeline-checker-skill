# Booking / services playbook

## Signals
Models: Service, Provider/Staff, Availability/Schedule, Slot, Booking/Appointment/Reservation, Timezone. Routes: /book, /availability, /appointments, /calendar. Libraries: date-fns-tz, luxon, fullcalendar, Cal.com embeds.

## Journeys
**Guest** — view services and availability; pick date → available slots shown; past dates disabled.
**Customer** — book a slot → confirmation → appears in "my bookings" → slot no longer available to others; reschedule → old slot freed; cancel → slot freed, status shown; booking at day boundaries and across a DST change date; change browser timezone if possible (or compare displayed time with server time in API).
**Concurrency** — try to book the same slot twice (two tabs or double-click confirm) → only one booking.
**Provider/Admin** → manage availability, block days, see bookings, cancel on behalf (customer sees it).

## Domain bug checklist
| Bug | Severity |
|---|---|
| Double booking of the same slot | critical |
| Times shown in wrong timezone / off by an hour | high |
| Cancelled booking keeps the slot blocked | high |
| Can book in the past or outside availability | high |
| Confirmation shows different time than booking list | high |
| Reschedule creates a duplicate instead of moving | medium |

## Data & safety notes
Deployed: don't book real providers' slots without approval; cancel every test booking at cleanup.
