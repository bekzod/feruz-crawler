CREATE TABLE "makers" (
	"value" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"sites" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
