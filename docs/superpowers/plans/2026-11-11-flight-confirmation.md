# Flight confirmation import

- iPhone SwiftUI only: user chooses image or PDF; text is extracted locally with Vision/PDFKit, bounded input, no automatic saving of file or passenger/booking data.
- Conservative, testable parser prefills unique labelled flight/date/time fields; ambiguous or missing fields stay empty and the user reviews and can edit. Boarding time is never inferred from departure time.
- Validate ISO calendar dates and 24-hour times, keep local wall-clock values, and show all fields for review. One segment per import; multi-segment ambiguity is not guessed.
- Save reviewed details and an optional departure-day itinerary entry together in one repository transaction with existing optimistic and account-scoped sync safeguards. Block duplicate flight/day and out-of-trip dates rather than silently duplicating/misplacing.
- Extend web normalization and fields so existing and future data survives web round trips. This must be deployed before installing the new native version, since the currently deployed web may drop unknown travelDetails fields.
- Verify parser fixtures, atomic rollback, duplicate protection, existing records, web normalization, builds and focused UI flows. Real-world OCR and signed-in cloud round trips require explicit real-data verification.
