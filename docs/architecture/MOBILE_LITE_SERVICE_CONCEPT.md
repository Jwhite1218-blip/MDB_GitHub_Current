# Mobile Lite Service Concept — Future Note

## Intent

MDB's primary ERP workspace remains desktop-first and available on the company
network. Mobile access is limited to specifically authorized employees and is a
focused **Mobile Lite** surface for situations where a phone can shorten the
service-response loop.

This note records a future concept only. It does not authorize or implement
mobile ordering, NFC access, notifications, or live service workflows yet.

## High-value service scenario

An NFC tag is attached to a drill, stored in its toolbox, or included with a
controlled key set sent with the machine. An authorized field or service
employee scans it and opens the matching MDB rig/service context on a phone.

The phone can then create a structured command or escalation such as:

- Service problem reported
- Part identification needed
- Replacement part requested
- Machine down / urgent assistance
- Office follow-up requested
- Photo, note, symptom, or observed damage attached

The mobile action creates a traceable **Service/Parts Request**, not a GP order.
The office receives the request with the rig identity and field context, checks
the serial BOM and controlled Tooling rules, verifies current GP inventory and
pricing, contacts the employee/customer when clarification is required, and
then creates the appropriate quote, order, build request, or service action.

## Proposed lifecycle

`NFC scan -> employee authentication -> rig/service profile -> structured field request -> office triage -> compatibility and GP verification -> quote/order/build/service action -> status returned to requester`

The originating mobile employee should be able to see that the request was
received, who owns it, its urgency, clarification requests, and its final
resolution without needing the complete desktop ERP.

## NFC boundary

The NFC tag should contain only a durable opaque identifier or HTTPS deep link,
for example a rig-context ID. It should not contain the full rig profile,
customer details, credentials, pricing, inventory, or authorization evidence.
NFC tags can be read or copied, so the scan identifies the intended context but
does not prove the employee's identity or permission.

MDB resolves the identifier server-side after authentication and then applies
normal customer, rig, serial, role, and source-authority rules. A lost or
replaced tag can therefore be revoked or redirected without changing the rig
record.

## Mobile Lite scope

Likely mobile-first capabilities:

1. Scan/search a rig, toolbox, or controlled equipment set.
2. View a compact verified rig identity and essential service facts.
3. Create an urgent service or parts-identification request.
4. Attach photos, notes, symptoms, and observed part numbers.
5. Send a controlled alert to the appropriate office queue.
6. Answer office clarification questions.
7. Track request acknowledgement, ownership, status, and resolution.
8. Receive narrowly scoped alerts for assigned or urgent work.

Explicitly desktop/office-controlled:

- Final compatibility decision
- Current GP inventory and pricing verification
- Quote and order approval
- Production-control acceptance and shop release
- Purchasing and financial posting
- Administrative setup and NFC tag assignment/revocation

## Reliability and security questions for the later design pass

- Will authorized phones reach MDB through the company network, managed VPN,
  zero-trust access, or a separately protected service gateway?
- Must a field request be captured offline and queued until connectivity returns?
- Which notification channel is approved: MDB push, SMS, email, Teams, or an
  internal service queue?
- Which roles may scan, submit, view customer context, attach media, escalate,
  acknowledge, and close requests?
- What information is safe on the compact mobile rig profile?
- Where should photos and service attachments be retained, and for how long?
- How are NFC tags commissioned, labeled, replaced, audited, and revoked?
- What urgency levels and acknowledgement times create a real escalation rather
  than an unstructured message?
- Does the tag identify only the rig, or can separate tags identify the toolbox,
  key set, service kit, or major controlled assembly?

## Guardrail

The value of Mobile Lite is speed and context capture. It must not bypass the
office, GP authority, serial-BOM verification, Tooling compatibility controls,
Production Control gatekeeper, or the audit trail.
