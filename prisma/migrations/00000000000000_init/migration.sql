-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('NEW', 'PROCESSING', 'READY', 'UNAVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'RETRYING', 'AVAILABLE', 'UNAVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('CHECK_ALL_CHANNELS', 'CHECK_CHANNEL', 'PROCESS_VIDEO', 'RETRY_TRANSCRIPT', 'WEEKLY_DIGEST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "youtubeChannelId" TEXT NOT NULL,
    "handle" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "uploadsPlaylistId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessfulCheckAt" TIMESTAMP(3),
    "lastProcessedVideoPublishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "thumbnailUrl" TEXT,
    "viewCount" BIGINT,
    "likeCount" BIGINT,
    "commentCount" BIGINT,
    "tags" JSONB,
    "categoryId" TEXT,
    "privacyStatus" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'NEW',
    "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "metadataFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "language" TEXT,
    "provider" TEXT,
    "rawText" TEXT,
    "segments" JSONB,
    "status" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_reports" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "structuredData" JSONB NOT NULL,
    "executiveSummary" TEXT,
    "verdict" TEXT,
    "overallScore" DOUBLE PRECISION,
    "transcriptUsed" BOOLEAN NOT NULL DEFAULT false,
    "confidence" TEXT,
    "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "tokensInput" INTEGER,
    "tokensOutput" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_jobs" (
    "id" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "channelId" TEXT,
    "videoId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monitoring_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_digests" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "structuredData" JSONB NOT NULL,
    "summary" TEXT,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "channels_youtubeChannelId_key" ON "channels"("youtubeChannelId");

-- CreateIndex
CREATE INDEX "channels_isActive_idx" ON "channels"("isActive");

-- CreateIndex
CREATE INDEX "channels_lastCheckedAt_idx" ON "channels"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtubeVideoId_key" ON "videos"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "videos_channelId_publishedAt_idx" ON "videos"("channelId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "videos_publishedAt_idx" ON "videos"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "videos_analysisStatus_idx" ON "videos"("analysisStatus");

-- CreateIndex
CREATE INDEX "videos_transcriptStatus_idx" ON "videos"("transcriptStatus");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_videoId_key" ON "transcripts"("videoId");

-- CreateIndex
CREATE INDEX "transcripts_status_nextRetryAt_idx" ON "transcripts"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_reports_videoId_key" ON "analysis_reports"("videoId");

-- CreateIndex
CREATE INDEX "analysis_reports_overallScore_idx" ON "analysis_reports"("overallScore");

-- CreateIndex
CREATE INDEX "analysis_reports_generatedAt_idx" ON "analysis_reports"("generatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "monitoring_jobs_dedupeKey_key" ON "monitoring_jobs"("dedupeKey");

-- CreateIndex
CREATE INDEX "monitoring_jobs_status_jobType_idx" ON "monitoring_jobs"("status", "jobType");

-- CreateIndex
CREATE INDEX "monitoring_jobs_createdAt_idx" ON "monitoring_jobs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "weekly_digests_weekStart_idx" ON "weekly_digests"("weekStart" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_digests_weekStart_weekEnd_key" ON "weekly_digests"("weekStart", "weekEnd");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_jobs" ADD CONSTRAINT "monitoring_jobs_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_jobs" ADD CONSTRAINT "monitoring_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

