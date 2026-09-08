-- Per-question response labels for the 1-5 scale. Existing rows backfill to
-- the previous global default so nothing on the customer form changes until
-- an admin edits a question's labels.
ALTER TABLE "questions" ADD COLUMN "ratingLabels" TEXT[] NOT NULL DEFAULT ARRAY['Very Poor', 'Poor', 'Average', 'Good', 'Excellent']::TEXT[];
