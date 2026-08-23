-- Dev/demo seed data. Safe to re-run against a fresh `supabase db reset`.
-- Uses fixed UUIDs so institutions/contacts/interactions can reference each
-- other predictably across statements.

-- ============================================================================
-- 1 recruiter (dev placeholder until Azure AD auth is wired up in Phase 3)
-- ============================================================================
INSERT INTO users (id, azure_oid, email, full_name, territory) VALUES
('00000000-0000-0000-0000-000000000001', 'dev-local-user', 'david.kim@example-university.edu', 'David Kim', 'East Asia');

-- ============================================================================
-- Institutions across all 3 tiers / a few countries
-- last_interaction_at values are deliberately spread to exercise all three
-- health_status buckets (active_warm / cooling / stalled_cold) plus one
-- never-contacted (NULL) institution.
-- ============================================================================
INSERT INTO institutions (id, user_id, name, domain, institution_type, tier, country, city, curriculum, reengagement_threshold_days, last_interaction_at, notes) VALUES
-- Tier 1 feeders
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Seoul Foreign School', 'seoulforeign.org', 'foreign_school', 'tier_1_feeder', 'South Korea', 'Seoul', 'IB / US Diploma', 10, NOW() - INTERVAL '3 days', 'Long-standing feeder relationship.'),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Chadwick International', 'chadwickschool.org', 'international_high_school', 'tier_1_feeder', 'South Korea', 'Songdo', 'IB', 10, NOW() - INTERVAL '2 days', NULL),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Korea International School', 'kis.or.kr', 'international_high_school', 'tier_1_feeder', 'South Korea', 'Pangyo', 'AP', 10, NOW() - INTERVAL '18 days', 'Cooling — routine check-in due.'),
-- Tier 2 high-potential
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Seoul Global High School', 'seoulglobal.hs.kr', 'local_high_school', 'tier_2_high_potential', 'South Korea', 'Seoul', 'Korean National + English track', 18, NOW() - INTERVAL '36 days', 'Stalled — needs re-engagement.'),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Busan Foreign School', 'busanforeign.org', 'foreign_school', 'tier_2_high_potential', 'South Korea', 'Busan', 'IB', 18, NOW() - INTERVAL '42 days', 'Stalled — needs re-engagement.'),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Dulwich College Seoul', 'dulwich.org', 'international_high_school', 'tier_2_high_potential', 'South Korea', 'Seoul', 'British / IB', 18, NOW() - INTERVAL '9 days', 'Shares domain with Dulwich Singapore/Beijing campuses — disambiguation not yet handled (deferred edge case).'),
-- Tier 3 standard
('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'Taejon Christian International School', 'tcis.on.ca', 'international_high_school', 'tier_3_standard', 'South Korea', 'Daejeon', 'American Diploma', 30, NOW() - INTERVAL '6 days', NULL),
('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Yokohama International School', 'yis.ac.jp', 'international_high_school', 'tier_3_standard', 'Japan', 'Yokohama', 'IB', 30, NOW() - INTERVAL '25 days', 'Cooling.'),
('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'International School Ho Chi Minh City', 'ishcmc.com', 'international_high_school', 'tier_3_standard', 'Vietnam', 'Ho Chi Minh City', 'IB', 30, NOW() - INTERVAL '1 day', NULL),
-- Never contacted (NULL last_interaction_at) — should read as stalled_cold
('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Nagoya International School', 'nis.ac.jp', 'international_high_school', 'tier_3_standard', 'Japan', 'Nagoya', 'IB', 30, NULL, 'New lead, not yet contacted.');

-- ============================================================================
-- Contacts (primary counselor per institution)
-- ============================================================================
INSERT INTO contacts (id, institution_id, name, email, title, phone, kakao_id, is_primary, preferences_notes) VALUES
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sarah Jenkins', 'sjenkins@seoulforeign.org', 'Head of College Counseling', '+82-2-330-3100', '@sfs_sarah', true, 'Focuses on transfer credits & merit aid.'),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Mark Davis', 'mdavis@chadwickschool.org', 'College Counselor', NULL, NULL, true, NULL),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Elena Park', 'epark@kis.or.kr', 'College Counselor', NULL, '@kis_elena', true, 'Prefers email over phone.'),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Jinwoo Choi', 'jchoi@seoulglobal.hs.kr', 'Study Abroad Advisor', NULL, NULL, true, NULL),
('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'Amy Vance', 'avance@busanforeign.org', 'College Counselor', NULL, NULL, true, 'Interested in aviation/STEM programs.'),
('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'Priya Nair', 'pnair@dulwich.org', 'Head of University Guidance', NULL, NULL, true, NULL),
('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'David Ahn', 'dahn@tcis.on.ca', 'College Counselor', NULL, NULL, true, NULL),
('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Kenji Watanabe', 'kwatanabe@yis.ac.jp', 'College Counselor', NULL, NULL, true, NULL),
('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'Linh Tran', 'ltran@ishcmc.com', 'College Counselor', NULL, NULL, true, 'Requests Vietnamese-language materials.');

-- ============================================================================
-- Interactions (a couple per active institution, timestamped consistent
-- with each institution's last_interaction_at above — the trigger will
-- overwrite institutions.last_interaction_at to match the latest one
-- inserted per institution, so order matters: insert oldest first).
-- ============================================================================
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, interaction_date) VALUES
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'in_person_visit', 'Seoul Fair Booth visit', 'Discussed IB credit equivalencies.', NOW() - INTERVAL '45 days'),
('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'email', 'Fall 2026 Info-Session Inquiry', 'Discussed hosting a Fall 2026 info-session for 12th graders. Sarah requested Oklahoma STEM flyers.', NOW() - INTERVAL '3 days'),

('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'virtual_meeting', 'Curriculum review call', 'Reviewed 2026 curriculum changes and articulation pathways.', NOW() - INTERVAL '2 days'),

('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'email', 'Scholarship tiers question', 'Elena asked about updated international scholarship tiers for 2027.', NOW() - INTERVAL '18 days'),

('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'phone_call', 'Initial outreach call', 'Introductory call, exchanged program overview materials.', NOW() - INTERVAL '36 days'),

('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'in_person_visit', 'On-Campus Counseling Meeting', 'Met with 15 seniors interested in aviation. Amy requested waiver sheet.', NOW() - INTERVAL '42 days'),

('10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'fair_booth', 'University Fair Booth', 'Good turnout, several students interested in engineering transfer pathways.', NOW() - INTERVAL '9 days'),

('10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'email', 'Materials request', 'David requested updated program brochures.', NOW() - INTERVAL '6 days'),

('10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'virtual_meeting', 'Info session follow-up', 'Discussed virtual info session logistics for spring term.', NOW() - INTERVAL '25 days'),

('10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'email', 'Welcome & program overview', 'Sent initial program overview and scholarship info in response to inbound inquiry.', NOW() - INTERVAL '1 day');
-- Institution 10 (Nagoya International School) intentionally has zero
-- interactions to exercise the never-contacted / NULL last_interaction_at case.
