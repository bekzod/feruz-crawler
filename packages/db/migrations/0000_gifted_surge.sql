CREATE TABLE "crawl_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid,
	"site" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"found_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "filter_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sites" jsonb DEFAULT '["goonet","carsensor"]'::jsonb NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"telegram_chat_id" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_listing_id" text NOT NULL,
	"url" text NOT NULL,
	"maker" text,
	"model" text,
	"grade" text,
	"model_year" integer,
	"mileage_km" integer,
	"displacement_cc" integer,
	"transmission" text,
	"fuel_type" text,
	"body_type" text,
	"drivetrain" text,
	"color" text,
	"doors" integer,
	"seats" integer,
	"inspection_until" text,
	"repair_history" boolean,
	"total_price" bigint,
	"vehicle_price" bigint,
	"prefecture" text,
	"dealer_name" text,
	"photos" jsonb DEFAULT '[]'::jsonb,
	"description_original" text,
	"raw" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"consecutive_misses" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"preset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_cache" (
	"field" text NOT NULL,
	"source_text" text NOT NULL,
	"english" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_field_source_text_pk" PRIMARY KEY("field","source_text")
);
--> statement-breakpoint
ALTER TABLE "crawl_runs" ADD CONSTRAINT "crawl_runs_preset_id_filter_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."filter_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_preset_id_filter_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."filter_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_id_uq" ON "listings" USING btree ("source","source_listing_id");--> statement-breakpoint
CREATE INDEX "price_history_listing_idx" ON "price_history" USING btree ("listing_id");