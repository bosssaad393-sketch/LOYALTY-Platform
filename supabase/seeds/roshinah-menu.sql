-- Al Roshinah (Sanad): the menu, copied from the venue's own public menu page on 2026-11-25.
-- Names, descriptions and prices are as shown there; the owner confirms them before go-live and edits them from
-- the owner screen afterwards. Generated from web/src/data/menus/roshinah.json. Run after seeds/roshinah.sql.
-- Safe to run again: it replaces this venue's menu.

delete from menu_items where venue_id = (select id from venues where slug = 'roshinah');
delete from menu_categories where venue_id = (select id from venues where slug = 'roshinah');

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Platters', 'بلاترات', 0 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Turkish Platter', 'بلاتر الفطور التركي', 'Includes: * Turkish Omelette * Finger Salad & Olives * Clotted Cream with Honey * Olive Oil & Zaatar * Makdous * Spicy Feta Cheese * Zaatar Labneh * Beetroot Cheese * Jam * Plain Labneh * Makdous Cheese * Karak or Red Tea (Pot) * Tannour Bread Note: Items on this platter cannot be substituted.', 'لا يمكن استبدال اي طبق في الصينيه عباره عن : بيض تركي سلطة الاصابع + زيتون قشطة بالعسل زيت وزعتر مكدوس جبنة الفيتا الحاره لبنة زعتر جبنة شمندر مربى لبنة ساده جبنة مكدوس دلة كرك أو شاي أحمر خبز تنور', 12000, '/venues/roshinah/menu/001.webp', 0),
  ('Khaleeji Platter', 'بلاتر الفطور الخليجي', 'Includes: * Chicken Liver * Chickpeas * Baked Beans * Cheese Samboosa * Eggs & Tomatoes * Balaleet * Karak or Red Tea (Pot) * Fresh Bread Note: Items on this platter cannot be substituted.', 'عبارة عن : كبدة دجاج بصوص دبس الرمان نخي لوبه سمبوسه جبن بيض وطماط بلاليط دلة كرك او شاي خبز تنور فرش لا يمكن استبدال اي طبق في الصينيه', 12000, '/venues/roshinah/menu/002.webp', 1)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Chef Specials', 'أطباق الشيف الخاصة', 1 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Felafel Special', 'فلافل سبيشال', 'A smooth mixture of labneh and beetroot paired with feta cheese, served with freshly fried falafel in the center, and garnished with crispy bread.', 'خلطة اللبنه بالشمندر مع جبنة الفيتا وسطها الفلافل المقليه و تزين بقطع الخبز الكرسبي', 3800, '/venues/roshinah/menu/003.webp', 0),
  ('Chef Hajar''s Special Chicken Liver', 'كبد الدجاج الخاص للشيف هاجر', 'A smooth mixture of labneh, fresh dill, and feta cheese, served with chicken liver cooked in pomegranate molasses in the center, garnished with crispy bread.', 'خلطة اللبنة بالشبنت مع جبنة الفيتا وسطها كبدة الدجاج بدبس الرمان وتزين بقطع من الخبز الكرسبي', 4500, '/venues/roshinah/menu/004.webp', 1),
  ('Mama''s Egg', 'بيض ماماز', 'Smooth and creamy scrambled eggs cooked with onions, garlic, and fresh dill.', 'بيض مخفوق مع البصل والثوم والشبنت ويقدم بشكل كريمي', 2900, '/venues/roshinah/menu/005.webp', 2),
  ('O''Ali', 'أوه علي', 'A smooth mixture of labneh and feta cheese topped with makdous and nuts, served with pieces of boiled egg on top and drizzled with paprika sauce.', 'خلطة اللبنة وجبنةالفيتا مع المكدوس والمكسرات فوقه قطع البيض المسلوق وصوص البابريكا', 3500, '/venues/roshinah/menu/006.webp', 3),
  ('Hummus & Foul', 'حمص بالفول', null, null, 2900, '/venues/roshinah/menu/007.webp', 4),
  ('Lebenah Falafel', 'لبنة بالفلافل', null, 'Lebenah Falafel', 3300, '/venues/roshinah/menu/008.webp', 5),
  ('Spicy Tikka Tacos', 'سبايسي تكا تاكو', 'Crispy pieces of fried bread stuffed with a special mixture of hummus and labneh, topped with fried tikka, and garnished with sweet pomegranate molasses.', 'قطع مقرمشة من الخبز المقلي، محشوة بمزيجنا الخاص من الحمص واللبنة، تعلوها قطع التكة المقلية وتُزين بدبس الرمان الحلو.', 3800, '/venues/roshinah/menu/009.webp', 6),
  ('Chicken Fatteh Special', null, null, null, 4800, '/venues/roshinah/menu/010.webp', 7),
  ('Chickpeas Fatteh Special', null, null, null, 3900, '/venues/roshinah/menu/011.webp', 8)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Khaleeji', 'خليجي', 2 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Balaleet & Eggs', 'بلاليط وبيض', 'Sweet, aromatic saffron and cardamom vermicelli topped with a savory egg omelette.', null, 2500, '/venues/roshinah/menu/012.webp', 0),
  ('Eggs & Tomato', 'بيض وطماط', 'A classic, comforting scramble of soft eggs simmered with juicy, slow-cooked tomatoes.', null, 2000, '/venues/roshinah/menu/013.webp', 1),
  ('Chicken Liver', 'كبدة دجاج', 'Tender, pan-seared chicken livers sautéed with caramelized onions and signature spices.', null, 2800, '/venues/roshinah/menu/014.webp', 2),
  ('Chickpeas', 'نخي', null, null, 1700, '/venues/roshinah/menu/015.webp', 3),
  ('Lubah', 'لوبة', null, 'Lubah', 1700, '/venues/roshinah/menu/016.webp', 4),
  ('Foul', 'فول', null, 'Foul', 1800, '/venues/roshinah/menu/017.webp', 5),
  ('Dal', 'حمسة دال', 'Wholesome, slow-cooked yellow lentils seasoned with fragrant garlic, cumin, and herbs.', null, 1900, '/venues/roshinah/menu/018.webp', 6),
  ('Falafel', 'فلافل', 'Crispy on the outside, fluffy on the inside golden chickpea fritters blended with fresh herbs.', null, 1900, '/venues/roshinah/menu/019.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'In the Pan', 'في الطابي (المقلاة)', 3 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Sunny Side Up', 'بيض عيون', 'Two eggs fried perfectly to order with soft, golden yolks.', null, 1500, '/venues/roshinah/menu/020.webp', 0),
  ('Shakshooka', 'شكشوكة', 'Eggs nestled in a rich, gently spiced tomato, pepper, and onion sauce.', null, 2700, '/venues/roshinah/menu/021.webp', 1),
  ('Greek Eggs', 'بيض يوناني', 'A Greek-inspired egg skillet tossed with Feta Cheese, fresh, vibrant herbs and savory ingredients.', null, 3700, '/venues/roshinah/menu/022.webp', 2),
  ('Mashed Luba shakshooka', 'شكشوكة لوبة مهروسة', 'Eggs nestled on a bed of mashed Luba (Beans), wIth special sauce and creamy spread cheese.', null, 3900, '/venues/roshinah/menu/023.webp', 3),
  ('Turkish Omelete', 'اومليت تركي', 'A Mediterranean-inspired egg skillet tossed with fresh, vibrant herbs and savory ingredients.', null, 3900, '/venues/roshinah/menu/024.webp', 4),
  ('Lava', 'لافا', 'Mild or Spicy shakshooka inspired eggs with cheddar cheese and special chefs sauce and cheese. (Boiled or scrambles).', null, 3900, '/venues/roshinah/menu/025.webp', 5)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Omelette Lovers', 'تحب الأومليت؟', 4 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Plain Omelete', 'آومليت سادة', null, 'Plain Omelete', 1500, '/venues/roshinah/menu/026.webp', 0),
  ('Cheese Omelette', null, null, null, 1800, '/venues/roshinah/menu/027.webp', 1),
  ('Vegetable Omelette', null, null, null, 1800, '/venues/roshinah/menu/028.webp', 2),
  ('Mushroom Omelette', null, null, null, 2300, '/venues/roshinah/menu/029.webp', 3)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Hamsaat', 'حمسات', 5 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Hamsaat Haloumi', 'حمسة حلومي', 'Halloumi cheese, house tomato sauce, green and black olives, mozzarella, and parmesan.', 'قطع من جبنة الحلومي يخلط بصلصة الطماطم الخاص بالشيف وقطع الزيتون الاخضر والزيتون الأسود وجبنة المازوريلا والبارميزان', 4500, '/venues/roshinah/menu/030.webp', 0),
  ('Chickpeas Hamsaat', 'حمسة نخي', 'Savory chickpeas stir-fried with fragrant onions, garlic, and a rich spice blend.', null, 2800, '/venues/roshinah/menu/031.webp', 1),
  ('Chicken Hamsaat', 'حمسة دجاح', 'Tender chicken sautéed in a rich, aromatic sauce.', null, 3500, '/venues/roshinah/menu/032.webp', 2),
  ('Fried Tikka Hamsaat', 'حمسة تكة مقلي', 'Juicy meat Tikka pan-flashed with intense, deeply flavorful regional spices.', null, 4800, '/venues/roshinah/menu/033.webp', 3)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Hot Appetizers', 'مقليات', 6 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('French Fries', null, null, null, 1500, '/venues/roshinah/menu/034.webp', 0),
  ('Samoosa Cheese', 'سمبوسة جبن', null, 'Samoosa Cheese', 1900, '/venues/roshinah/menu/035.webp', 1),
  ('Spicy Potato Samoosa', 'سمبوسة بطاطا حارة', null, 'Spicy Potato Samoosa', 1900, '/venues/roshinah/menu/036.webp', 2),
  ('Chicken Spinach Samoosa', 'سمبوسة دجاج وسبانخ', null, 'Chicken Spinach Samoosa', 2200, '/venues/roshinah/menu/037.webp', 3),
  ('Chicken Musakhan S.Rolls', 'سبرنق روول مسخن دجاج', null, 'Chicken Musakhan S.Rolls', 2500, '/venues/roshinah/menu/038.webp', 4),
  ('Vege Spring Rolls', 'سبرنق روول خضرة', null, 'Vege Spring Rolls', 1900, '/venues/roshinah/menu/039.webp', 5),
  ('Cheese N Zattar Rolls', 'سبرنق روول جبن وزعتر', null, 'Cheese N Zattar Rolls', 1900, '/venues/roshinah/menu/040.webp', 6)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Cold Appetizers', 'مقبلات', 7 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Hummus', 'حمص', null, null, 1800, '/venues/roshinah/menu/041.webp', 0),
  ('Grilled Feta Cheese', 'جبنة فيتا مشوية', null, null, 2000, '/venues/roshinah/menu/042.webp', 1),
  ('Lebnah with Pizza Sauce', 'لبنة مع صلصة البيتزا', null, null, 1800, '/venues/roshinah/menu/043.webp', 2),
  ('Spicy Hummus', 'بلاتر الحمص الحار', null, null, 2500, '/venues/roshinah/menu/044.webp', 3),
  ('Feta Cheese Zattar Dip', 'تغميسة جبنة الفيتا بالزعتر', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/045.webp', 4),
  ('Feta Cheese Beetroot Dip', 'تغميسة جبنة الفيتا بالشمندر', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/046.webp', 5),
  ('Spicy Feta Cheese Dip', 'تغميسة جبنة الفيتا الحارة', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/047.webp', 6),
  ('Feta Cheese Makdoos Dip', 'تغميسة جبنة الفيتا بالمكدوس', 'Chef Um Waleed Creation', null, 2400, '/venues/roshinah/menu/048.webp', 7),
  ('Tikka Hummus Platter', 'بلاتر الحمص بالتكا', null, null, 4000, '/venues/roshinah/menu/049.webp', 8)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Sides', 'نقنقة', 8 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Shredded Cheddar', 'جبن مبشور', null, 'Shredded Cheddar', 1500, '/venues/roshinah/menu/050.webp', 0),
  ('Cream & Honey', 'قشطة وعسل', null, 'Cream & Honey', 1500, '/venues/roshinah/menu/051.webp', 1),
  ('Fried Halloumi', 'حلومي مقلي', 'Fried Haloumi', null, 2900, '/venues/roshinah/menu/052.webp', 2),
  ('Feta Cheese and Zaatar Balls', 'كرات جبنة الفيتا بالزعتر', 'Labneh Balls', null, 1800, '/venues/roshinah/menu/053.webp', 3),
  ('Zattar Dip', 'تغميسة الزعتر', null, 'Zattar Dip', 1200, '/venues/roshinah/menu/054.webp', 4),
  ('Makdous', 'مكدوس', null, 'Makdous', 1800, '/venues/roshinah/menu/055.webp', 5),
  ('Finger Salad & Olives', 'سلطة أصابع وزيتون', null, 'Finger Salad & Olives', 1100, '/venues/roshinah/menu/056.webp', 6),
  ('Lebneh & Zattar', 'لبنة وزعتر', null, 'Lebneh & Zattar', 1500, '/venues/roshinah/menu/057.webp', 7),
  ('lebneh & Jam', 'لبنة ومربى', 'lebned & Jam', null, 1500, '/venues/roshinah/menu/058.webp', 8),
  ('Honey', 'عسل', null, 'Honey', 1000, '/venues/roshinah/menu/059.webp', 9),
  ('Jam', 'مربى', null, 'Jam', 1000, '/venues/roshinah/menu/060.webp', 10),
  ('Labneh', 'لبنة', null, 'Labneh', 1000, '/venues/roshinah/menu/061.webp', 11)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Saj Bread', 'خبز الصاج', 9 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Cheese and Zaater', 'الجبن والزعتر', null, null, 2500, '/venues/roshinah/menu/062.webp', 0),
  ('Muhammarah', 'محمرة', null, null, 2500, '/venues/roshinah/menu/063.webp', 1),
  ('Lebnah and Honey', 'لبنان والعسل', null, null, 2500, '/venues/roshinah/menu/064.webp', 2),
  ('Chocolate', 'شيكولاتة', null, null, 3000, '/venues/roshinah/menu/065.webp', 3),
  ('Mehyawa', 'ميهياوا', null, null, 2500, '/venues/roshinah/menu/066.webp', 4),
  ('Beef and Cheese', null, null, null, 3000, '/venues/roshinah/menu/067.webp', 5)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'From the Tanoor', 'من التنور', 10 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Cheese Khoboz', 'خبر بالجبنة', null, 'Cheese Khoboz', 1000, '/venues/roshinah/menu/068.webp', 0),
  ('Cheese & Zaater Khoboz', 'خبز بالجبنة والزعتر', null, 'Cheese & Zaater Khoboz', 1300, '/venues/roshinah/menu/069.webp', 1),
  ('Nutella Khoboz', 'خبز بالنوتيلا', null, 'Nutella Khoboz', 1700, '/venues/roshinah/menu/070.webp', 2),
  ('Mehyawa Bread', 'خبز مهياوة', null, 'Mehyawa Bread', 2000, '/venues/roshinah/menu/071.webp', 3),
  ('Khoboz with Halwa', null, null, null, 2000, '/venues/roshinah/menu/072.webp', 4)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Traditional Cold', 'المشروبات: يسرسح', 11 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Rose Milk', 'حليب ورد', null, null, 1300, '/venues/roshinah/menu/073.webp', 0),
  ('Rose Drink', 'شربت ورد', null, null, 1300, null, 1),
  ('Vimto', 'فيمتو', null, null, 1300, '/venues/roshinah/menu/075.webp', 2),
  ('Saffron Drink', 'شربت زعفران', null, null, 1800, '/venues/roshinah/menu/076.webp', 3),
  ('Saffron Milk', 'حليب الزعفران', null, null, 2000, null, 4),
  ('Green Drink', null, null, null, 1200, '/venues/roshinah/menu/078.webp', 5),
  ('Karkade Original', null, null, null, 1600, '/venues/roshinah/menu/079.webp', 6),
  ('Karkade Rose', null, null, null, 1800, '/venues/roshinah/menu/080.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Traditional Hot', 'المشروبات: تعديل مزاج', 12 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Karak Tea Cup', 'كوب كرك', null, null, 600, '/venues/roshinah/menu/081.webp', 0),
  ('Karak Tea Pot', 'دلة كرك', null, null, 1800, '/venues/roshinah/menu/082.webp', 1),
  ('Tea Cup', 'كوب شاي', null, null, 600, '/venues/roshinah/menu/083.webp', 2),
  ('Tea Pot', 'دلة شاي', null, null, 1500, null, 3),
  ('Moroccan Tea Pot (Small)', 'غوري شاي مغربي صغير', null, null, 1500, '/venues/roshinah/menu/085.webp', 4),
  ('Moroccan Tea Pot (Big)', 'غوري شاي مغربي كبير', null, null, 2300, '/venues/roshinah/menu/086.webp', 5),
  ('Turkish Coffee', 'قهوة تركية', null, null, 1300, '/venues/roshinah/menu/087.webp', 6),
  ('French Coffee', 'قهوة فرنسية', null, null, 1300, '/venues/roshinah/menu/088.webp', 7)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);

with c as (insert into menu_categories (venue_id, name_en, name_ar, sort) select id, 'Drinks: Fresh Juices', 'المشروبات: Fresh Juices', 13 from venues where slug = 'roshinah' returning id, venue_id)
insert into menu_items (venue_id, category_id, name_en, name_ar, note_en, note_ar, price_fils, image_url, sort)
select c.venue_id, c.id, i.name_en, i.name_ar, i.note_en, i.note_ar, i.price_fils, i.image_url, i.sort from c, (values
  ('Lemon and Mint juice', null, null, null, 1600, null, 0),
  ('Lemon Juice', null, null, null, 1500, null, 1)
) as i(name_en, name_ar, note_en, note_ar, price_fils, image_url, sort);
