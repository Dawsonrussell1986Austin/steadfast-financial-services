-- Steadfast CMS — seed data
-- Populates articles, team_members, and site_content from the initial JSON files.
-- Safe to re-run: uses ON CONFLICT DO NOTHING where possible.

-- ── ARTICLES ──
insert into public.articles (title, date, category, summary, image, link, author) values
  (
    'Mid-Year Market Outlook: Staying Disciplined Through Volatility',
    '2026-03-28', 'commentary',
    'Markets have seen renewed volatility in 2026. Here''s how we''re positioning client portfolios and why a disciplined, long-term approach continues to be the most effective strategy for building wealth.',
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=800&q=75',
    '', 'Matthew McGahey, CFP®'
  ),
  (
    '2026 Tax Planning: Key Changes Families Should Know',
    '2026-02-10', 'planning',
    'New tax brackets, updated contribution limits, and changes to estate tax exemptions — here''s what matters most for your 2026 financial plan and steps you can take now.',
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=800&q=75',
    '', 'Matthew McGahey, CFP®'
  ),
  (
    'Why We Coordinate With Your CPA and Attorney',
    '2026-01-15', 'planning',
    'Financial planning, tax strategy, and estate law are deeply interconnected. We explain how our collaborative approach with trusted professionals leads to better outcomes for your family.',
    'https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=800&q=75',
    '', 'Matthew McGahey, CFP®'
  ),
  (
    'Steadfast Welcomes Paul Bush to the Team',
    '2026-04-01', 'news',
    'We''re excited to announce that Paul Bush has joined Steadfast Financial Services. With a background in finance and over 15 years of organizational leadership, Paul brings a disciplined, values-driven approach to helping families steward their resources well.',
    '', 'our-people.html', 'Steadfast Financial Services'
  )
on conflict do nothing;

-- ── TEAM MEMBERS ──
insert into public.team_members (sort_order, name, title, creds, bio, education, personal, photo) values
  (
    10,
    'Matthew McGahey',
    'President & Owner',
    'CFP® · ChFC® · RICP® · CKA®',
    'Matt joined Steadfast on January 1, 2013 and became President and Owner on January 1, 2022. He came to the firm after five years at Enterprise Rent-a-Car, where he achieved branch management status. Between 2013 and 2017 he earned the CFP®, ChFC®, and RICP® designations from The American College, and more recently added the CKA® designation focused on ethical financial stewardship.',
    'Bachelor of Science in Business Management, University of Central Florida (2008)',
    'Matt is married to Joy and has three sons — Caleb, Zachary, and Keegan. He''s active in Grace Church Orlando and involved in its foster family ministry. Outside of work he enjoys fishing, surfing, college football, golf, running, and coaching basketball.',
    'assets/team/matt-mcgahey.jpg'
  ),
  (
    20,
    'Paul Bush',
    'Financial Advisor',
    'Finance · Organizational Leadership · MDiv',
    E'Paul is deeply passionate about helping individuals steward their resources well. He believes that financial planning is ultimately about trust — walking alongside clients with clarity, integrity, and their best interests at heart. He brings a disciplined, strategic approach to financial planning, paired with a strong relational focus.\n\nIn addition to his financial background, Paul has over 15 years of organizational leadership experience in pastoral ministry. He currently serves as the Lead Pastor of a growing church. This combination of financial expertise and people-centered leadership shapes his thoughtful, values-driven approach to serving clients. Highly organized and deeply relational, Paul is motivated by a strong desire to see financial resources used wisely and purposefully.',
    E'Bachelor of Science in Finance, University of Central Florida (2008)\nMaster of Divinity, Gordon-Conwell Theological Seminary',
    'Paul is happily married to his wife, Karis, and they are raising three children together. He brings the same care, responsibility, and long-term perspective to his clients that he values in his own family life.',
    'assets/team/paul-bush.jpg'
  ),
  (
    30,
    'Raymond Johnson',
    'Founder',
    'Accounting · Tax · Financial Planning',
    'Raymond established Steadfast Financial Services in 1998, bringing more than twenty years of experience in accounting, tax, and financial planning — including eight years as a partner with Ronald Blue & Company. His steady hand shaped the firm''s fee-only, relationship-first philosophy.',
    E'Bachelor of Science in Finance, University of Central Florida (1973)\nMaster of Science in Accounting, University of Central Florida (1976)\nMaster of Taxation, University of Denver (1982)',
    'Raymond is married with four children and thirteen grandchildren. He enjoys family time, reading, traveling, and golf, and has served on the boards of several charitable organizations.',
    'assets/team/raymond-johnson.jpg'
  )
on conflict do nothing;

-- ── SITE CONTENT ──
insert into public.site_content (key, value) values
  ('hero_headline',      'A Steady Hand For Your Financial Journey'),
  ('hero_subtext',       'Financial resources aren''t an end in themselves — they''re a tool to help families accomplish their goals. Through fee-only planning and disciplined investment management, we guide you with clarity, care, and unwavering commitment.'),
  ('whatwedo_headline',  E'Built Around You,\nBacked By Experience'),
  ('whatwedo_body',      E'Our approach centers on comprehensive financial planning and disciplined investment management designed to help you reach your goals. We review every major planning area, present clear alternatives, and educate you along the way.\n\nSince 1998, we''ve partnered with families who value a intergenerational approach — one rooted in close relationships, low client-to-manager ratios, and exceptional personal service you can count on for the long term.'),
  ('whoweare_headline',  E'Built On Trust,\nFocused On Results'),
  ('whoweare_body',      E'Your relationship with your advisor should be built on trust and transparency. We combine personalized service with deep investment expertise so you feel confident in both our approach and our commitment to your long-term success.\n\nFounded in 1998 by Raymond Johnson and now led by Matthew McGahey, CFP®, ChFC®, RICP®, CKA®, Steadfast has served families and individuals across Central Florida and beyond — offering independent, fee-only counsel you can rely on through every stage of life.'),
  ('values_headline',    'The Principles That Guide Our Work'),
  ('values_body',        'Our philosophy is simple: everyone deserves access to advanced planning and disciplined investment strategies. We''re committed to hard-working families who value a partnership approach to wealth management.'),
  ('contact_headline',   E'Ready To See What\nSteady Guidance Can Do?'),
  ('contact_body',       'Your financial journey deserves a trusted partner. Through fee-only planning and disciplined investment management, we''ll help you pursue your goals with clarity and confidence. Contact us today to discuss how our approach could work for your unique situation.'),
  ('fp_lede',            'For financial planning clients, we offer comprehensive coverage of all major areas of financial planning. We collaborate throughout the process by presenting multiple alternatives and educating you on tax code changes, risk management, and the decisions you face at each stage of life. For married couples, active participation from both spouses is strongly encouraged.'),
  ('im_lede',            'Steadfast uses primarily no-load mutual funds and ETFs selected through rigorous research to identify fund managers with sustainable competitive advantages. Our portfolio allocation strategy combines diversified asset classes suited to each client''s timeframe and risk tolerance, grounded in modern portfolio theory principles.'),
  ('team_headline',      E'Built By Experience,\nDriven By Service'),
  ('team_body',          'Since 1998, Steadfast has been led by advisors who value deep client relationships, lifelong learning, and the privilege of stewarding other people''s resources well.')
on conflict (key) do nothing;
