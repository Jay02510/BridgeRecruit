-- Real client sample data (from TalkFile_Julian_Partner Interactions-sample.xlsx, 'Korea Interactions' tab).
-- GAPS vs schema, placeholder strategy used (flagged per user's PDF-fidelity rule):
--   domain: sheet has no website data at all -> slugified placeholder domain, lookup API will NOT match real email for these until real domains collected.
--   contacts.email: sheet has no contact emails, only 1 name surfaces in free-text notes (Brian Kay) -> placeholder unknown@<domain>.
--   tier: not tracked in source sheet -> defaulted to tier_2_high_potential for all 3.
--   city: column exists in sheet but empty for all 3 rows -> left NULL.

INSERT INTO institutions (id, user_id, name, domain, institution_type, tier, country, city, address, notes)
VALUES ('d9887764-4d7d-485a-9696-a28be544ae16', '00000000-0000-0000-0000-000000000001', 'Jeju International School', 'jeju-international-school.placeholder', 'international_high_school', 'tier_2_high_potential', 'South Korea', NULL, NULL, 'Collaboration: Potentially Sending F1 Students');
INSERT INTO institutions (id, user_id, name, domain, institution_type, tier, country, city, address, notes)
VALUES ('cada4664-8f64-4d0e-aed4-4621ebe5a0ed', '00000000-0000-0000-0000-000000000001', 'Busan Dong-A University', 'busan-dong-a-university.placeholder', 'university_partner', 'tier_2_high_potential', 'South Korea', NULL, NULL, 'Collaboration: Exchange + SUSA (fee-paying students) | Programs: Media Communication, Biotechnology');
INSERT INTO institutions (id, user_id, name, domain, institution_type, tier, country, city, address, notes)
VALUES ('d2c229ce-21b2-4091-8cf5-a0daa345e295', '00000000-0000-0000-0000-000000000001', 'Daejeon International School', 'daejeon-international-school.placeholder', 'international_high_school', 'tier_2_high_potential', 'South Korea', NULL, NULL, 'Collaboration: Potentially Sending F1 Students');

INSERT INTO contacts (id, institution_id, name, email, title, is_primary)
VALUES ('12632318-2ab4-4e21-951e-8410ed89e71a', 'cada4664-8f64-4d0e-aed4-4621ebe5a0ed', 'Brian Kay', 'unknown@busan-dong-a-university.placeholder', 'International Affairs Coordinator', true);

INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('d9887764-4d7d-485a-9696-a28be544ae16', NULL, '00000000-0000-0000-0000-000000000001', 'in_person_visit', 'Meeting - Jeju International School', 'I visited them during the AEO tour', 'I visited them during the AEO tour', '2026-04-29 00:00:00');
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('d9887764-4d7d-485a-9696-a28be544ae16', NULL, '00000000-0000-0000-0000-000000000001', 'email', 'Contact - Jeju International School', 'I have sent them an email telling them I will be in Jeju for the fair; 

They have answered saying that they will have a mini-fair the day before the big fair;', 'I have sent them an email telling them I will be in Jeju for the fair; 

They have answered saying that they will have a mini-fair the day before the big fair;', '2026-08-04 00:00:00');
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('cada4664-8f64-4d0e-aed4-4621ebe5a0ed', '12632318-2ab4-4e21-951e-8410ed89e71a', '00000000-0000-0000-0000-000000000001', 'in_person_visit', 'Meeting - Busan Dong-A University', 'I visited Brian Kay (International Affairs Coordinator), in charge of both inbound and outbound programs

We introduce eachothers schools since it was the first time we have met. I also let him know about our StudyUSA. He says that they have plenty of schools so he can''t see students being interested in it. I told him I would find out about increasing the StudyUSA scholarship
He said that his position is permanent and he doesn''t rotate unlike other offices

Facts about university
- Lowest tuitio', 'I visited Brian Kay (International Affairs Coordinator), in charge of both inbound and outbound programs

We introduce eachothers schools since it was the first time we have met. I also let him know about our StudyUSA. He says that they have plenty of schools so he can''t see students being interested in it. I told him I would find out about increasing the StudyUSA scholarship
He said that his position is permanent and he doesn''t rotate unlike other offices

Facts about university
- Lowest tuition in Busan; less than $3,000 per semester
- Largest private university in Busan
- have tripled their number of international students (currently 2,400)
- Housing costs $700-$800 per semester
- English track programs:
1. Intergrated Business Management
2. Engineering
3. AI (Spring 2027)
4. Media (Spring 2027)

They also have a popular summer program; that we could consider to count for exchange slots

Buddy program (1 Korean to 3 international students)', '2026-06-24 00:00:00');
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('cada4664-8f64-4d0e-aed4-4621ebe5a0ed', '12632318-2ab4-4e21-951e-8410ed89e71a', '00000000-0000-0000-0000-000000000001', 'email', 'Contact - Busan Dong-A University', 'Mr. Kay has sent me information about the classes that are offered in English;
and some other information so that I can pass it onto Jared

He suggested increasing the StudyUSA scholarship to make it more competitive since many of their other tuition paid programs are cheaper options (Canada & England)

I have responded to him and thanked him for the information and I will speak to Brandon about the increased StudyUSA suggestion

I have sent Brian a message asking him about ways we can promote s', 'Mr. Kay has sent me information about the classes that are offered in English;
and some other information so that I can pass it onto Jared

He suggested increasing the StudyUSA scholarship to make it more competitive since many of their other tuition paid programs are cheaper options (Canada & England)

I have responded to him and thanked him for the information and I will speak to Brandon about the increased StudyUSA suggestion

I have sent Brian a message asking him about ways we can promote study abroad this semester; waiting to hear back', '2026-08-18 00:00:00');
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('d2c229ce-21b2-4091-8cf5-a0daa345e295', NULL, '00000000-0000-0000-0000-000000000001', 'in_person_visit', 'Meeting - Daejeon International School', 'I visited them during the AEO tour; One student showed significant interest in our PGA Golf Management program; the principal stated that they would welcome me to come back and present', 'I visited them during the AEO tour; One student showed significant interest in our PGA Golf Management program; the principal stated that they would welcome me to come back and present', '2026-04-28 00:00:00');
INSERT INTO interactions (institution_id, contact_id, user_id, channel, subject, summary, raw_content, interaction_date)
VALUES ('d2c229ce-21b2-4091-8cf5-a0daa345e295', NULL, '00000000-0000-0000-0000-000000000001', 'email', 'Contact - Daejeon International School', 'I have asked the school principal if I can visit;

The principal has responded and welcomes me to visit; she is asking if I can visit in September

I have asked if I can visit September 21; but that is their Chuseok holiday

So maybe Sept 28

I told her I would let her know depending on my overseas travel', 'I have asked the school principal if I can visit;

The principal has responded and welcomes me to visit; she is asking if I can visit in September

I have asked if I can visit September 21; but that is their Chuseok holiday

So maybe Sept 28

I told her I would let her know depending on my overseas travel', '2026-08-18 00:00:00');

INSERT INTO tasks_followups (user_id, institution_id, contact_id, title, focus_agenda, due_date)
VALUES ('00000000-0000-0000-0000-000000000001', 'd9887764-4d7d-485a-9696-a28be544ae16', NULL, 'They will be a part of the Jeju World University Fair', 'Consider signing up for a viist on August 28th in the morning after the fair', '2026-08-24 00:00:00');
INSERT INTO tasks_followups (user_id, institution_id, contact_id, title, focus_agenda, due_date)
VALUES ('00000000-0000-0000-0000-000000000001', 'cada4664-8f64-4d0e-aed4-4621ebe5a0ed', '12632318-2ab4-4e21-951e-8410ed89e71a', '-', 'Follow up if they haven''t responded', '2026-09-10 00:00:00');
INSERT INTO tasks_followups (user_id, institution_id, contact_id, title, focus_agenda, due_date)
VALUES ('00000000-0000-0000-0000-000000000001', 'd2c229ce-21b2-4091-8cf5-a0daa345e295', NULL, 'Visit in September', 'Give her an update about my plans to visit', '2026-09-03 00:00:00');
