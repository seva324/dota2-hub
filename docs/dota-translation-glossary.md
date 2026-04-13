# Dota 2 翻译术语表

> 机器可读源建议以结构化 JSON 为准；Markdown 只作为人工维护/查阅视图。

## 推荐维护策略

- **主数据源**：`resources/dota-glossary/*.json`（脚本可直接读取，适合喂给 LLM 或做后处理）
- **人工查阅视图**：本 Markdown 文档（由脚本生成，方便肉眼检查）
- **更新命令**：`node scripts/sync-dota-translation-glossary.mjs`

## 数据来源

- 官方名称：Dota 2 官方 datafeed（heroes / items / abilities，英文 + 简体中文）
- 英文英雄简称：Liquipedia《List of Abbreviations》
- 中文别名与社区优先叫法：仓库内人工维护的 `resources/dota-glossary/manual-aliases.mjs`

## 通用术语（2）

| 中文正式名 | 英文正式名 | 英文别名/旧称 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 命石 | Facet | Facet / Facets / Aspect / Aspects |  | term_facet |
| 痛苦魔方 | Tormentor | Tormentor / Tormentors | 魔方 / 焦哥 | term_tormentor |

## 英雄（127）

| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 亚巴顿 | Abaddon | loa / aba |  | npc_dota_hero_abaddon |
| 炼金术士 | Alchemist | alc |  | npc_dota_hero_alchemist |
| 远古冰魄 | Ancient Apparition | aa | 冰魂 | npc_dota_hero_ancient_apparition |
| 敌法师 | Anti-Mage | am | 敌法 | npc_dota_hero_antimage |
| 天穹守望者 | Arc Warden | aw |  | npc_dota_hero_arc_warden |
| 斧王 | Axe |  | 斧子 | npc_dota_hero_axe |
| 祸乱之源 | Bane |  |  | npc_dota_hero_bane |
| 蝙蝠骑士 | Batrider | bat | 蝙蝠 | npc_dota_hero_batrider |
| 兽王 | Beastmaster | bst / beast |  | npc_dota_hero_beastmaster |
| 血魔 | Bloodseeker | bs | 血魔 | npc_dota_hero_bloodseeker |
| 赏金猎人 | Bounty Hunter | bh | 赏金 | npc_dota_hero_bounty_hunter |
| 酒仙 | Brewmaster | brew / panda |  | npc_dota_hero_brewmaster |
| 钢背兽 | Bristleback | bb |  | npc_dota_hero_bristleback |
| 育母蜘蛛 | Broodmother | bro / brood | 蜘蛛 | npc_dota_hero_broodmother |
| 半人马战行者 | Centaur Warrunner | cent / centaur | 人马 / 半人马 | npc_dota_hero_centaur |
| 混沌骑士 | Chaos Knight | ck |  | npc_dota_hero_chaos_knight |
| 陈 | Chen |  |  | npc_dota_hero_chen |
| 克林克兹 | Clinkz | cli | 小骷髅 | npc_dota_hero_clinkz |
| 发条技师 | Clockwerk | cw / cg / clock | 发条 | npc_dota_hero_rattletrap |
| 水晶室女 | Crystal Maiden | cm | 冰女 | npc_dota_hero_crystal_maiden |
| 黑暗贤者 | Dark Seer | ds | 黑贤 | npc_dota_hero_dark_seer |
| 邪影芳灵 | Dark Willow | dw |  | npc_dota_hero_dark_willow |
| 破晓辰星 | Dawnbreaker |  |  | npc_dota_hero_dawnbreaker |
| 戴泽 | Dazzle | daz | 戴泽 | npc_dota_hero_dazzle |
| 死亡先知 | Death Prophet | dp / Krobelus |  | npc_dota_hero_death_prophet |
| 干扰者 | Disruptor | dis / Thrall | 萨尔 | npc_dota_hero_disruptor |
| 末日使者 | Doom | Doom Bringer / Doom Bringer Hero | 末日 | npc_dota_hero_doom_bringer |
| 龙骑士 | Dragon Knight | dk | 龙骑 | npc_dota_hero_dragon_knight |
| 卓尔游侠 | Drow Ranger | dr / drow / Traxex | 小黑 | npc_dota_hero_drow_ranger |
| 大地之灵 | Earth Spirit | esp / earth / Kaolin | 土猫 | npc_dota_hero_earth_spirit |
| 撼地者 | Earthshaker | es | 小牛 | npc_dota_hero_earthshaker |
| 上古巨神 | Elder Titan | et / titan | 大牛 | npc_dota_hero_elder_titan |
| 灰烬之灵 | Ember Spirit | emb / ember / Xin | 火猫 | npc_dota_hero_ember_spirit |
| 魅惑魔女 | Enchantress | ench |  | npc_dota_hero_enchantress |
| 谜团 | Enigma | eni |  | npc_dota_hero_enigma |
| 虚空假面 | Faceless Void | fv / void |  | npc_dota_hero_faceless_void |
| 天涯墨客 | Grimstroke | gs / grim | 墨客 | npc_dota_hero_grimstroke |
| 矮人直升机 | Gyrocopter | gyro | 飞机 | npc_dota_hero_gyrocopter |
| 森海飞霞 | Hoodwink |  | 松鼠 | npc_dota_hero_hoodwink |
| 哈斯卡 | Huskar | hus | 神灵 | npc_dota_hero_huskar |
| 祈求者 | Invoker | inv | 卡尔 | npc_dota_hero_invoker |
| 艾欧 | Io |  | 小精灵 | npc_dota_hero_wisp |
| 杰奇洛 | Jakiro | jak / thd | 双头龙 | npc_dota_hero_jakiro |
| 主宰 | Juggernaut | jug / jugg | 剑圣 | npc_dota_hero_juggernaut |
| 光之守卫 | Keeper of the Light | kotl | 光法 | npc_dota_hero_keeper_of_the_light |
| 凯 | Kez |  |  | npc_dota_hero_kez |
| 昆卡 | Kunkka | kun | 船长 | npc_dota_hero_kunkka |
| 朗戈 | Largo |  |  | npc_dota_hero_largo |
| 军团指挥官 | Legion Commander | lc / legion | 军团 | npc_dota_hero_legion_commander |
| 拉席克 | Leshrac | lesh | 老鹿 | npc_dota_hero_leshrac |
| 巫妖 | Lich |  |  | npc_dota_hero_lich |
| 噬魂鬼 | Lifestealer | ls / life / Naix | 小狗 | npc_dota_hero_life_stealer |
| 莉娜 | Lina |  | 火女 | npc_dota_hero_lina |
| 莱恩 | Lion |  |  | npc_dota_hero_lion |
| 独行德鲁伊 | Lone Druid | ld / druid / sylla | 熊德 / 德鲁伊 | npc_dota_hero_lone_druid |
| 露娜 | Luna |  | 月骑 | npc_dota_hero_luna |
| 狼人 | Lycan | lyc |  | npc_dota_hero_lycan |
| 马格纳斯 | Magnus | mag | 猛犸 | npc_dota_hero_magnataur |
| 玛西 | Marci |  |  | npc_dota_hero_marci |
| 玛尔斯 | Mars |  |  | npc_dota_hero_mars |
| 美杜莎 | Medusa | med | 一姐 | npc_dota_hero_medusa |
| 米波 | Meepo |  |  | npc_dota_hero_meepo |
| 米拉娜 | Mirana | mir / potm | 白虎 | npc_dota_hero_mirana |
| 齐天大圣 | Monkey King | mk | 猴子 / 大圣 | npc_dota_hero_monkey_king |
| 变体精灵 | Morphling | mor / morph | 水人 | npc_dota_hero_morphling |
| 琼英碧灵 | Muerta |  |  | npc_dota_hero_muerta |
| 娜迦海妖 | Naga Siren | Naga | 娜迦 / 小娜迦 | npc_dota_hero_naga_siren |
| 自然先知 | Nature's Prophet | Furion | 先知 | npc_dota_hero_furion |
| 瘟疫法师 | Necrophos | nec / Necro / Necrolyte | NEC / 死灵法 | npc_dota_hero_necrolyte |
| 暗夜魔王 | Night Stalker | ns | 夜魔 | npc_dota_hero_night_stalker |
| 司夜刺客 | Nyx Assassin | na / nyx | 小强 | npc_dota_hero_nyx_assassin |
| 食人魔魔法师 | Ogre Magi | ogre | 蓝胖 | npc_dota_hero_ogre_magi |
| 全能骑士 | Omniknight | omni | 全能 | npc_dota_hero_omniknight |
| 神谕者 | Oracle | ora |  | npc_dota_hero_oracle |
| 殁境神蚀者 | Outworld Destroyer | od / Outworld Devourer | 黑鸟 | npc_dota_hero_obsidian_destroyer |
| 石鳞剑士 | Pangolier | pan | 滚滚 | npc_dota_hero_pangolier |
| 幻影刺客 | Phantom Assassin | pa | 幻刺 | npc_dota_hero_phantom_assassin |
| 幻影长矛手 | Phantom Lancer | pl |  | npc_dota_hero_phantom_lancer |
| 凤凰 | Phoenix | phx | 凤凰 | npc_dota_hero_phoenix |
| 獸 | Primal Beast |  |  | npc_dota_hero_primal_beast |
| 帕克 | Puck |  | 精灵龙 | npc_dota_hero_puck |
| 帕吉 | Pudge |  | 屠夫 / 胖子 | npc_dota_hero_pudge |
| 帕格纳 | Pugna | pug | 骨法 | npc_dota_hero_pugna |
| 痛苦女王 | Queen of Pain | qop | 女王 | npc_dota_hero_queenofpain |
| 雷泽 | Razor | raz | 电魂 | npc_dota_hero_razor |
| 力丸 | Riki | sa | 隐刺 | npc_dota_hero_riki |
| 百戏大王 | Ringmaster |  |  | npc_dota_hero_ringmaster |
| 拉比克 | Rubick | rub | 拉比克 | npc_dota_hero_rubick |
| 沙王 | Sand King | sk | 沙王 | npc_dota_hero_sand_king |
| 暗影恶魔 | Shadow Demon | sd | 毒狗 | npc_dota_hero_shadow_demon |
| 影魔 | Shadow Fiend | sf / Nevermore | 影魔 | npc_dota_hero_nevermore |
| 暗影萨满 | Shadow Shaman | ss / Rhasta | 小Y | npc_dota_hero_shadow_shaman |
| 沉默术士 | Silencer | sil | 沉默 | npc_dota_hero_silencer |
| 天怒法师 | Skywrath Mage | sky / sm | 天怒 | npc_dota_hero_skywrath_mage |
| 斯拉达 | Slardar | sld | 大鱼人 | npc_dota_hero_slardar |
| 斯拉克 | Slark | slk | 小鱼人 | npc_dota_hero_slark |
| 电炎绝手 | Snapfire |  | 奶奶 | npc_dota_hero_snapfire |
| 狙击手 | Sniper | sni | 火枪 | npc_dota_hero_sniper |
| 幽鬼 | Spectre | spe | 幽鬼 | npc_dota_hero_spectre |
| 裂魂人 | Spirit Breaker | sb | 白牛 | npc_dota_hero_spirit_breaker |
| 风暴之灵 | Storm Spirit | sto / storm | 蓝猫 | npc_dota_hero_storm_spirit |
| 斯温 | Sven |  | 流浪剑客 | npc_dota_hero_sven |
| 工程师 | Techies | tec | 炸弹人 | npc_dota_hero_techies |
| 圣堂刺客 | Templar Assassin | ta | 圣堂 | npc_dota_hero_templar_assassin |
| 恐怖利刃 | Terrorblade | tb | TB / 魂守 | npc_dota_hero_terrorblade |
| 潮汐猎人 | Tidehunter | tide | 潮汐 | npc_dota_hero_tidehunter |
| 伐木机 | Timbersaw | tim / timber | 伐木机 | npc_dota_hero_shredder |
| 修补匠 | Tinker | tk | TK / 修补匠 | npc_dota_hero_tinker |
| 小小 | Tiny |  |  | npc_dota_hero_tiny |
| 树精卫士 | Treant Protector | tp / tree / treant | 大树 | npc_dota_hero_treant |
| 巨魔战将 | Troll Warlord | tw / troll |  | npc_dota_hero_troll_warlord |
| 巨牙海民 | Tusk |  | 海民 | npc_dota_hero_tusk |
| 孽主 | Underlord | ul |  | npc_dota_hero_abyssal_underlord |
| 不朽尸王 | Undying | ud | 尸王 | npc_dota_hero_undying |
| 熊战士 | Ursa |  | 拍拍熊 | npc_dota_hero_ursa |
| 复仇之魂 | Vengeful Spirit | vs | 复仇 | npc_dota_hero_vengefulspirit |
| 剧毒术士 | Venomancer | veno | 剧毒 | npc_dota_hero_venomancer |
| 冥界亚龙 | Viper |  | 毒龙 | npc_dota_hero_viper |
| 维萨吉 | Visage | vis | 死灵龙 | npc_dota_hero_visage |
| 虚无之灵 | Void Spirit |  | 紫猫 | npc_dota_hero_void_spirit |
| 术士 | Warlock | wl |  | npc_dota_hero_warlock |
| 编织者 | Weaver | wea | 蚂蚁 | npc_dota_hero_weaver |
| 风行者 | Windranger | wr / Windrunner | 风行 | npc_dota_hero_windrunner |
| 寒冬飞龙 | Winter Wyvern | ww | 冰龙 / 冬龙 | npc_dota_hero_winter_wyvern |
| 巫医 | Witch Doctor | wd | 巫医 | npc_dota_hero_witch_doctor |
| 冥魂大帝 | Wraith King | wk / Skeleton King | 骷髅王 | npc_dota_hero_skeleton_king |
| 宙斯 | Zeus |  | 众神之王 | npc_dota_hero_zuus |

## 物品（409）

| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 深渊之刃 | Abyssal Blade |  | 深渊刀 / 深渊 | item_abyssal_blade |
| 不朽之守护 | Aegis of the Immortal |  |  | item_aegis |
| 永恒之盘 | Aeon Disk |  |  | item_aeon_disk |
| 以太透镜 | Aether Lens |  |  | item_aether_lens |
| 阿哈利姆福佑 | Aghanim's Blessing |  |  | item_ultimate_scepter_2 |
| 阿哈利姆福佑 - 肉山 | Aghanim's Blessing - Roshan |  |  | item_ultimate_scepter_roshan |
| 阿哈利姆神杖 | Aghanim's Scepter | Aghanim's Scepter / Aghs / Scepter | A杖 | item_ultimate_scepter |
| 魔晶 | Aghanim's Shard | Aghanim's Shard / Shard / Shards | 阿哈利姆魔晶 / 魔晶 | item_aghanims_shard |
| 阿哈利姆魔晶 - 消耗品 | Aghanim's Shard - Consumable |  |  | item_aghanims_shard_roshan |
| 警觉 | Alert |  |  | item_enhancement_alert |
| 遗迹守护者 | Ancient Guardian |  |  | item_ancient_guardian |
| 动物信使 | Animal Courier |  |  | item_courier |
| 极 | Apex |  |  | item_apex |
| 秘奥闪光 | Arcane Blink |  |  | item_arcane_blink |
| 奥术鞋 | Arcane Boots |  | 秘法鞋 / 秘法 | item_arcane_boots |
| 奥术指环 | Arcane Ring |  |  | item_arcane_ring |
| 秘术师铠甲 | Arcanist's Armor |  |  | item_force_field |
| 莫尔迪基安的臂章 | Armlet of Mordiggian |  |  | item_armlet |
| 简朴短帽 | Ascetic's Cap |  |  | item_ascetic_cap |
| 余烬军团战盾 | Ash Legion Shield |  |  | item_ash_legion_shield |
| 强袭胸甲 | Assault Cuirass | AC | 强袭 | item_assault |
| 冒险 | Audacious |  |  | item_enhancement_audacious |
| 艾维娜之羽 | Aviana's Feather |  |  | item_avianas_feather |
| 金袋 | Bag of Gold |  |  | item_furion_gold_bag |
| 弩炮 | Ballista |  |  | item_ballista |
| 精灵布带 | Band of Elvenskin |  |  | item_boots_of_elves |
| 狂战斧 | Battle Fury | BF | 狂战斧 | item_bfury |
| 挚爱回忆 | Beloved Memory |  |  | item_ofrenda |
| 力量腰带 | Belt of Strength |  |  | item_belt_of_strength |
| Black Grimoire
(Warlock) | Black Grimoire
(Warlock) |  |  | item_black_grimoire |
| 黑皇杖 | Black King Bar | BKB | 黑皇杖 | item_black_king_bar |
| 刃甲 | Blade Mail | BM | 刃甲 | item_blade_mail |
| 欢欣之刃 | Blade of Alacrity |  |  | item_blade_of_alacrity |
| 攻击之爪 | Blades of Attack |  |  | item_blades_of_attack |
| 雷火弹 | Blast Rig |  |  | item_black_powder_bag |
| 闪烁匕首 | Blink Dagger | Blink | 跳刀 | item_blink |
| 闪电指套 | Blitz Knuckles |  |  | item_blitz_knuckles |
| 奶酪块 | Block of Cheese |  |  | item_royale_with_cheese |
| 血腥榴弹 | Blood Grenade |  |  | item_blood_grenade |
| 血精石 | Bloodstone |  | 血精石 | item_bloodstone |
| 血棘 | Bloodthorn |  |  | item_bloodthorn |
| 暗影邪典 | Book of Shadows |  |  | item_book_of_shadows |
| 冥灵书 | Book of the Dead |  |  | item_demonicon |
| 宽容之靴 | Boots of Bearing |  |  | item_boots_of_bearing |
| 速度之靴 | Boots of Speed |  |  | item_boots |
| 远行鞋 | Boots of Travel | BoT / BoTs | 飞鞋 | item_travel_boots |
| 远行鞋 | Boots of Travel 2 |  |  | item_travel_boots_2 |
| 魔瓶 | Bottle |  |  | item_bottle |
| 无边 | Boundless |  |  | item_enhancement_boundless |
| 护腕 | Bracer |  |  | item_bracer |
| 壮实 | Brawny |  |  | item_enhancement_brawny |
| 飞贼之刃 | Brigand's Blade |  |  | item_misericorde |
| 阔剑 | Broadsword |  |  | item_broadsword |
| 扫帚柄 | Broom Handle |  |  | item_broom_handle |
| 玄冥盾牌 | Buckler |  |  | item_buckler |
| 凌厉长鞭 | Bullwhip |  |  | item_bullwhip |
| 蝴蝶 | Butterfly |  |  | item_butterfly |
| 祭礼长袍 | Ceremonial Robe |  |  | item_ceremonial_robe |
| 锁子甲 | Chainmail |  |  | item_chainmail |
| 裂隙之石 | Chasm Stone |  |  | item_chasm_stone |
| 奶酪 | Cheese |  |  | item_cheese |
| 碎裂背心 | Chipped Vest |  |  | item_chipped_vest |
| 圆环 | Circlet |  |  | item_circlet |
| 净化药水 | Clarity |  |  | item_clarity |
| 大剑 | Claymore |  |  | item_claymore |
| 抗魔斗篷 | Cloak |  |  | item_cloak |
| 火焰斗篷 | Cloak of Flames |  |  | item_cloak_of_flames |
| 笨拙渔网 | Clumsy Net |  |  | item_clumsy_net |
| 咒术师触媒 | Conjurer's Catalyst |  |  | item_conjurers_catalyst |
| 圣化护服 | Consecrated Wraps |  |  | item_consecrated_wraps |
| 丰饶之环 | Cornucopia |  |  | item_cornucopia |
| 崎岖外衣 | Craggy Coat |  |  | item_craggy_coat |
| 克莱拉牧杖 | Crella's Crozier |  |  | item_crellas_crozier |
| 赤红甲 | Crimson Guard |  | 赤红甲 / 赤红 | item_crimson_guard |
| 致残之弩 | Crippling Crossbow |  |  | item_crippling_crossbow |
| 王冠 | Crown |  |  | item_crown |
| 粗暴 | Crude |  |  | item_enhancement_crude |
| 水晶剑 | Crystalys |  |  | item_lesser_crit |
| 代达罗斯之殇 | Daedalus |  | 大炮 | item_greater_crit |
| 瑞斯图尔尖匕 | Dagger of Ristul |  |  | item_dagger_of_ristul |
| 达贡之神力 | Dagon |  |  | item_dagon_5 |
| 蒲公英护符 | Dandelion Amulet |  |  | item_dandelion_amulet |
| 不羁甲壳 | Defiant Shell |  |  | item_defiant_shell |
| 恶魔刀锋 | Demon Edge |  |  | item_demon_edge |
| 黯灭 | Desolator |  | 黯灭 | item_desolator |
| 德尊血式 | Dezun Bloodrite |  |  | item_dezun_bloodrite |
| 宝冕 | Diadem |  |  | item_diadem |
| 净魂之刃 | Diffusal Blade |  | 散失 | item_diffusal_blade |
| 失节华冠 | Disgraced Regalia |  |  | item_divine_regalia_broken |
| 散魂剑 | Disperser |  |  | item_disperser |
| 圣剑 | Divine Rapier |  | 圣剑 | item_rapier |
| 天赐华冠 | Divine Regalia |  |  | item_divine_regalia |
| 专横 | Dominant |  |  | item_enhancement_dominant |
| 休眠珍品 | Dormant Curio |  |  | item_dormant_curio |
| 双面币 | Doubloon |  |  | item_doubloon |
| 魔龙枪 | Dragon Lance |  |  | item_dragon_lance |
| 炎龙之鳞 | Dragon Scale |  |  | item_dragon_scale |
| 韧鼓 | Drum of Endurance | Drums | 战鼓 | item_ancient_janggo |
| 决斗家手套 | Duelist Gloves |  |  | item_duelist_gloves |
| 显影之尘 | Dust of Appearance |  |  | item_dust |
| 鹰歌弓 | Eaglesong |  |  | item_eagle |
| 回音战刃 | Echo Sabre |  | 回音刀 | item_echo_sabre |
| 古龙诗集 | Eldwurm's Edda |  |  | item_eldwurms_edda |
| 万灵药水 | Elixir |  |  | item_elixer |
| 精灵外衣 | Elven Tunic |  |  | item_elven_tunic |
| 魔法芒果 | Enchanted Mango |  |  | item_enchanted_mango |
| 魔力箭袋 | Enchanted Quiver |  |  | item_enchanted_quiver |
| 附魔师之椟 | Enchanter's Bauble |  |  | item_enchanters_bauble |
| 能量之球 | Energy Booster |  |  | item_energy_booster |
| 精之灵器 | Essence Distiller |  |  | item_essence_distiller |
| 精华指环 | Essence Ring |  |  | item_essence_ring |
| 永世法衣 | Eternal Shroud |  |  | item_eternal_shroud |
| 虚灵之刃 | Ethereal Blade |  |  | item_ethereal_blade |
| Eul的神圣法杖 | Eul's Scepter of Divinity | Euls | 风杖 | item_cyclone |
| 进化 | Evolved |  |  | item_enhancement_evolved |
| 机械之心 | Ex Machina |  |  | item_ex_machina |
| 斯嘉蒂之眼 | Eye of Skadi |  | 冰眼 | item_skadi |
| 维齐尔之眼 | Eye of the Vizier |  |  | item_eye_of_the_vizier |
| 暗淡胸针 | Faded Broach |  |  | item_faded_broach |
| 仙灵榴弹 | Fae Grenade |  |  | item_paintball |
| 仙灵之火 | Faerie Fire |  |  | item_faerie_fire |
| 仙灵饰品 | Fairy's Trinket |  |  | item_mysterious_hat |
| 猎鹰战刃 | Falcon Blade |  |  | item_falcon_blade |
| 天崩 | Fallen Sky |  |  | item_fallen_sky |
| 狂热 | Feverish |  |  | item_enhancement_feverish |
| 凶猛 | Fierce |  |  | item_enhancement_fierce |
| 剥皮血囊 | Flayer's Bota |  |  | item_flayers_bota |
| 捷足 | Fleetfooted |  |  | item_enhancement_fleetfooted |
| 闪灵 | Flicker |  |  | item_flicker |
| 毛毛帽 | Fluffy Hat |  |  | item_fluffy_hat |
| 飞行信使 | Flying Courier |  |  | item_flying_courier |
| 采菌套具 | Forager's Kit |  |  | item_foragers_kit |
| 原力鞋 | Force Boots |  |  | item_force_boots |
| 原力法杖 | Force Staff |  | 推推 / 推推棒 | item_force_staff |
| 先祖的财富 | Forebearer's Fortune |  |  | item_ofrenda_pledge |
| 聚合神符 | Fusion Rune |  |  | item_fusion_rune |
| 烈风护体 | Gale Guard |  |  | item_gale_guard |
| 力量手套 | Gauntlets of Strength |  |  | item_gauntlets |
| 真视宝石 | Gem of True Sight |  |  | item_gem |
| 幽魂权杖 | Ghost Scepter |  |  | item_ghost |
| 巨人之槌 | Giant's Maul |  |  | item_giant_maul |
| 巨人之戒 | Giant's Ring |  |  | item_giants_ring |
| 缚灵索 | Gleipnir |  | 缚灵索 | item_gungir |
| 微光披风 | Glimmer Cape |  | 微光 | item_glimmer_cape |
| 加速手套 | Gloves of Haste |  |  | item_gloves |
| 蛛丝斗篷 | Gossamer Cape |  |  | item_gossamer_cape |
| 大疗伤莲花 | Great Healing Lotus |  |  | item_great_famango |
| 高级仙灵之火 | Greater Faerie Fire |  |  | item_greater_faerie_fire |
| 巨大疗伤莲花 | Greater Healing Lotus |  |  | item_greater_famango |
| 贪婪 | Greedy |  |  | item_enhancement_greedy |
| 驱邪护符 | Gris-Gris |  |  | item_grisgris |
| 林野长弓 | Grove Bow |  |  | item_grove_bow |
| 卫士胫甲 | Guardian Greaves |  | 大鞋 | item_guardian_greaves |
| 火药手套 | Gunpowder Gauntlet |  |  | item_gunpowder_gauntlets |
| 迈达斯之手 | Hand of Midas |  | 点金手 / 点金 | item_hand_of_midas |
| 协和 | Harmonizer |  |  | item_harmonizer |
| 鱼叉 | Harpoon |  |  | item_harpoon |
| 浩劫巨锤 | Havoc Hammer |  |  | item_havoc_hammer |
| 恢复头巾 | Headdress |  |  | item_headdress |
| 疗伤莲花 | Healing Lotus |  |  | item_famango |
| 治疗药膏 | Healing Salve |  |  | item_flask |
| 恐鳌之心 | Heart of Tarrasque |  | 龙心 | item_heart |
| 天堂之戟 | Heaven's Halberd |  | 天堂之戟 | item_heavens_halberd |
| 铁意头盔 | Helm of Iron Will |  |  | item_helm_of_iron_will |
| 支配头盔 | Helm of the Dominator |  |  | item_helm_of_the_dominator |
| 统御头盔 | Helm of the Overlord |  |  | item_helm_of_the_overlord |
| 不朽尸王的头盔 | Helm of the Undying |  |  | item_helm_of_the_undying |
| 圣洁吊坠 | Holy Locket |  |  | item_holy_locket |
| 挑战头巾 | Hood of Defiance |  |  | item_hood_of_defiance |
| 笨重 | Hulking |  |  | item_enhancement_hulking |
| 飓风长戟 | Hurricane Pike |  | 飓风长戟 / Pike | item_hurricane_pike |
| 怪蛇之息 | Hydra's Breath |  |  | item_hydras_breath |
| 振奋宝石 | Hyperstone |  |  | item_hyperstone |
| 丝奎奥克神像 | Idol of Scree'auk |  |  | item_idol_of_screeauk |
| 幻术师披风 | Illusionist's Cape |  |  | item_illusionsts_cape |
| 魔童之爪 | Imp Claw |  |  | item_imp_claw |
| 凝魂之露 | Infused Raindrops |  |  | item_infused_raindrop |
| 铁树枝干 | Iron Branch |  |  | item_branches |
| 寒铁钢爪 | Iron Talon |  |  | item_iron_talon |
| 铁树坚果 | Ironwood Nut |  |  | item_foragers_stats |
| 铁树之木 | Ironwood Tree |  |  | item_ironwood_tree |
| item_bottomless_chalice | item_bottomless_chalice |  |  | item_bottomless_chalice |
| item_caster_rapier | item_caster_rapier |  |  | item_caster_rapier |
| item_greater_mango | item_greater_mango |  |  | item_greater_mango |
| item_horizon | item_horizon |  |  | item_horizon |
| item_mechanical_arm | item_mechanical_arm |  |  | item_mechanical_arm |
| item_miniboss_minion_summoner | item_miniboss_minion_summoner |  |  | item_miniboss_minion_summoner |
| item_super_blink | item_super_blink |  |  | item_super_blink |
| 标枪 | Javelin |  |  | item_javelin |
| 基迪花粉袋 | Jidi Pollen Bag |  |  | item_jidi_pollen_bag |
| 慧光 | Kaya |  |  | item_kaya |
| 散慧对剑 | Kaya and Sange |  |  | item_kaya_and_sange |
| 基恩镜片 | Keen Optic |  |  | item_keen_optic |
| 犀利 | Keen-eyed |  |  | item_enhancement_keen_eyed |
| 绝刃 | Khanda |  |  | item_angels_demise |
| 狗头人酒杯 | Kobold Cup |  |  | item_kobold_cup |
| 追击之矛 | Lance of Pursuit |  |  | item_lance_of_pursuit |
| 利维坦的鱼 | Leviathan's Fish |  |  | item_tidehunter_fish |
| 集光器 | Light Collector |  |  | item_light_collector |
| 林肯法球 | Linken's Sphere | Linkens | 林肯 | item_sphere |
| 清莲宝珠 | Lotus Orb |  | 莲花 | item_lotus_orb |
| 狂石包 | Madstone Bundle |  |  | item_madstone_bundle |
| 漩涡 | Maelstrom | Mael | 电锤 | item_maelstrom |
| 法师克星 | Mage Slayer |  |  | item_mage_slayer |
| 神妙明灯 | Magic Lamp |  |  | item_panic_button |
| 魔棒 | Magic Stick |  |  | item_magic_stick |
| 魔杖 | Magic Wand |  |  | item_magic_wand |
| 放大单片镜 | Magnifying Monocle |  |  | item_magnifying_monocle |
| 魔力药水 | Mana Draught |  |  | item_mana_draught |
| 芒果树 | Mango Tree |  |  | item_mango_tree |
| 癫狂 | Manic |  |  | item_enhancement_manic |
| 幻影斧 | Manta Style |  |  | item_manta |
| 智力斗篷 | Mantle of Intelligence |  |  | item_mantle |
| 烈士鳞甲 | Martyr's Plate |  |  | item_martyrs_plate |
| 疯狂面具 | Mask of Madness |  |  | item_mask_of_madness |
| 勇气勋章 | Medallion of Courage |  |  | item_medallion_of_courage |
| 梅肯斯姆 | Mekansm |  |  | item_mekansm |
| 仁慈与恩泽 | Mercy & Grace |  |  | item_muertas_gun |
| 变态上颚 | Metamorphic Mandible |  |  | item_metamorphic_mandible |
| 陨星锤 | Meteor Hammer |  |  | item_meteor_hammer |
| 智灭 | Mind Breaker |  |  | item_mind_breaker |
| 恶牛角 | Minotaur Horn |  |  | item_minotaur_horn |
| 神镜盾 | Mirror Shield |  |  | item_mirror_shield |
| 秘银锤 | Mithril Hammer |  |  | item_mithril_hammer |
| 雷神之锤 | Mjollnir |  | 雷神之锤 | item_mjollnir |
| 金箍棒 | Monkey King Bar | MKB | 金箍棒 | item_monkey_king_bar |
| 银月之晶 | Moon Shard |  |  | item_moon_shard |
| 吸血面具 | Morbid Mask |  |  | item_lifesteal |
| 神秘法杖 | Mystic Staff |  |  | item_mystic_staff |
| 神秘 | Mystical |  |  | item_enhancement_mystical |
| 死灵书 | Necronomicon | Necrobook / Necronomicon 1 / Necronomicon 2 / Necronomicon 3 | 死灵书 / 小死灵书 / 大死灵书 | item_necronomicon_legacy |
| 天诛之咒 | Nemesis Curse |  |  | item_nemesis_curse |
| 幽冥披巾 | Nether Shawl |  |  | item_nether_shawl |
| 轻快 | Nimble |  |  | item_enhancement_nimble |
| 忍者用具 | Ninja Gear |  |  | item_ninja_gear |
| 空灵挂件 | Null Talisman |  |  | item_null_talisman |
| 否决坠饰 | Nullifier |  | 否决坠饰 | item_nullifier |
| 空明杖 | Oblivion Staff |  |  | item_oblivion_staff |
| 侦察·岗哨守卫 | Observer and Sentry Wards |  |  | item_ward_dispenser |
| 侦察守卫 | Observer Ward |  |  | item_ward_observer |
| 玄奥手镯 | Occult Bracelet |  |  | item_occult_bracelet |
| 海洋之心 | Ocean Heart |  |  | item_ocean_heart |
| 玲珑心 | Octarine Core |  | 玲珑心 | item_octarine_core |
| 食人魔之斧 | Ogre Axe |  |  | item_ogre_axe |
| 食人魔海豹图腾 | Ogre Seal Totem |  |  | item_ogre_seal_totem |
| 枯萎之珠 | Orb of Blight |  |  | item_blight_stone |
| 腐蚀之珠 | Orb of Corrosion |  |  | item_orb_of_corrosion |
| 毁灭灵球 | Orb of Destruction |  |  | item_orb_of_destruction |
| 冰霜之珠 | Orb of Frost |  |  | item_orb_of_frost |
| 淬毒之珠 | Orb of Venom |  |  | item_orb_of_venom |
| 紫怨 | Orchid Malevolence |  |  | item_orchid |
| 殁境法杖 | Outworld Staff |  |  | item_outworld_staff |
| 盛势闪光 | Overwhelming Blink |  |  | item_overwhelming_blink |
| 骑士剑 | Paladin Sword |  |  | item_paladin_sword |
| 圣斧 | Parasma |  |  | item_devastator |
| 天游烙印 | Partisan's Brand |  |  | item_partisans_brand |
| 长盾 | Pavise |  |  | item_pavise |
| 五锋长剑 | Penta-Edged Sword |  |  | item_penta_edged_sword |
| 坚韧球 | Perseverance |  |  | item_pers |
| 相位鞋 | Phase Boots |  | 相位鞋 / 相位 | item_phase_boots |
| 贤者石 | Philosopher's Stone |  |  | item_philosophers_stone |
| 凤凰余烬 | Phoenix Ash |  |  | item_phoenix_ash |
| 灵匣 | Phylactery |  |  | item_phylactery |
| 豚杆 | Pig Pole |  |  | item_unstable_wand |
| 洞察烟斗 | Pipe of Insight |  | 笛子 | item_pipe |
| 海盗帽 | Pirate Hat |  |  | item_pirate_hat |
| 板甲 | Platemail |  |  | item_platemail |
| 袖珍肉山 | Pocket Roshan |  |  | item_pocket_roshan |
| 袖珍高塔 | Pocket Tower |  |  | item_pocket_tower |
| 精气之球 | Point Booster |  |  | item_point_booster |
| 蝌蚪护符 | Pollywog Charm |  |  | item_polliwog_charm |
| 穷鬼盾 | Poor Man's Shield |  |  | item_poor_mans_shield |
| 附魂面具 | Possessed Mask |  |  | item_possessed_mask |
| 动力鞋 | Power Treads | PT / Treads | 假腿 | item_power_treads |
| 亲王短刀 | Prince's Knife |  |  | item_princes_knife |
| 先知灵摆 | Prophet's Pendulum |  |  | item_prophets_pendulum |
| 通灵头带 | Psychic Headband |  |  | item_psychic_headband |
| 学徒之礼 | Pupil's Gift |  |  | item_pupils_gift |
| 皮洛士斗篷 | Pyrrhic Cloak |  |  | item_pyrrhic_cloak |
| 短棍 | Quarterstaff |  |  | item_quarterstaff |
| 压制之刃 | Quelling Blade |  |  | item_quelling_blade |
| 迅速 | Quickened |  |  | item_enhancement_quickened |
| 加速护符 | Quickening Charm |  |  | item_quickening_charm |
| 银闪护符 | Quicksilver Amulet |  |  | item_quicksilver_amulet |
| 辉耀 | Radiance |  | 辉耀 | item_radiance |
| 回响之笼 | Rattlecage |  |  | item_rattlecage |
| 掠夺者之斧 | Reaver |  |  | item_reaver |
| 刷新球 | Refresher Orb | Refresher | 刷新球 | item_refresher |
| 刷新球碎片 | Refresher Shard |  | 刷新碎片 | item_refresher_shard |
| 维修器具 | Repair Kit |  |  | item_repair_kit |
| 滋补 | Restorative |  |  | item_enhancement_restorative |
| 英灵胸针 | Revenant's Brooch |  |  | item_revenants_brooch |
| 影墟棱晶 | Riftshadow Prism |  |  | item_riftshadow_prism |
| 天鹰之戒 | Ring of Aquila |  |  | item_ring_of_aquila |
| 王者之戒 | Ring of Basilius |  |  | item_ring_of_basilius |
| 治疗指环 | Ring of Health |  |  | item_ring_of_health |
| 守护指环 | Ring of Protection |  |  | item_ring_of_protection |
| 回复戒指 | Ring of Regen |  |  | item_ring_of_regen |
| 恐鳌之戒 | Ring of Tarrasque |  |  | item_ring_of_tarrasque |
| 撕裂之鞭 | Ripper's Lash |  |  | item_rippers_lash |
| 河水药瓶：血红 | River Vial: Blood |  |  | item_river_painter7 |
| 河水药瓶：液铬 | River Vial: Chrome |  |  | item_river_painter |
| 河水药瓶：干涸 | River Vial: Dry |  |  | item_river_painter2 |
| 河水药瓶：导电 | River Vial: Electrified |  |  | item_river_painter5 |
| 河水药瓶：油污 | River Vial: Oil |  |  | item_river_painter4 |
| 河水药瓶：魔水 | River Vial: Potion |  |  | item_river_painter6 |
| 河水药瓶：烂泥 | River Vial: Slime |  |  | item_river_painter3 |
| 法师长袍 | Robe of the Magi |  |  | item_robe |
| 阿托斯之棍 | Rod of Atos | Atos | 阿托斯 | item_rod_of_atos |
| 肉山的战旗 | Roshan's Banner |  |  | item_roshans_banner |
| 蜂王浆 | Royal Jelly |  |  | item_royal_jelly |
| 圣者遗物 | Sacred Relic |  |  | item_relic |
| 安全泡泡 | Safety Bubble |  |  | item_safety_bubble |
| 贤者面罩 | Sage's Mask |  |  | item_sobi_mask |
| 散华 | Sange |  |  | item_sange |
| 散夜对剑 | Sange and Yasha |  |  | item_sange_and_yasha |
| 撒旦之邪力 | Satanic |  | 撒旦 | item_satanic |
| 占卜之铲 | Scrying Shovel |  |  | item_ofrenda_shovel |
| 邪恶镰刀 | Scythe of Vyse | Hex | 羊刀 | item_sheepstick |
| 炽热纹章 | Searing Signet |  |  | item_searing_signet |
| 宁静种籽 | Seeds of Serenity |  |  | item_seeds_of_serenity |
| 先哲之石 | Seer Stone |  |  | item_seer_stone |
| 岗哨守卫 | Sentry Ward |  |  | item_ward_sentry |
| 锯齿短刀 | Serrated Shiv |  |  | item_serrated_shiv |
| 暗影护符 | Shadow Amulet |  |  | item_shadow_amulet |
| 影刃 | Shadow Blade |  | 隐刀 | item_invis_sword |
| 披巾 | Shawl |  |  | item_shawl |
| 希瓦的守护 | Shiva's Guard |  |  | item_shivas_guard |
| 白银之锋 | Silver Edge |  | 大隐刀 | item_silver_edge |
| 魅影之衣 | Sister's Shroud |  |  | item_sisters_shroud |
| 碎颅锤 | Skull Basher | Basher | 碎骨锤 | item_basher |
| 敏捷便鞋 | Slippers of Agility |  |  | item_slippers |
| 诡计之雾 | Smoke of Deceit |  |  | item_smoke_of_deceit |
| 炎阳纹章 | Solar Crest |  |  | item_solar_crest |
| 振魂石 | Soul Booster |  |  | item_soul_booster |
| 灵魂之戒 | Soul Ring |  |  | item_soul_ring |
| 勇气之光 | Spark of Courage |  |  | item_spark_of_courage |
| 行家阵列 | Specialist's Array |  |  | item_specialists_array |
| 法术棱镜 | Spell Prism |  |  | item_spell_prism |
| 咏咒之坠 | Spellslinger |  |  | item_spellslinger |
| 网虫腿 | Spider Legs |  |  | item_spider_legs |
| 魂之灵瓮 | Spirit Vessel |  | 大骨灰 / 灵龛 | item_spirit_vessel |
| 片甲 | Splintmail |  |  | item_splintmail |
| 魔力法杖 | Staff of Wizardry |  |  | item_staff_of_wizardry |
| 石羽小包 | Stonefeather Satchel |  |  | item_stonefeather_satchel |
| 风暴宝器 | Stormcrafter |  |  | item_stormcrafter |
| 圆盾 | Stout Shield |  |  | item_stout_shield |
| 寂灭 | Stygian Desolator |  |  | item_desolator_2 |
| 迅疾闪光 | Swift Blink |  |  | item_swift_blink |
| 闪避护符 | Talisman of Evasion |  |  | item_talisman_of_evasion |
| 树之祭祀 | Tango |  |  | item_tango |
| 树之祭祀（共享） | Tango (Shared) |  |  | item_tango_single |
| 望远镜 | Telescope |  |  | item_spy_gadget |
| 平世剑 | The Leveller |  |  | item_the_leveller |
| 厚重 | Thick |  |  | item_enhancement_thick |
| 第三只眼 | Third Eye |  |  | item_third_eye |
| 赛莉蒙妮之冠 | Tiara of Selemene |  |  | item_tiara_of_selemene |
| 第1级代币 | Tier 1 Token |  |  | item_tier1_token |
| 第2级代币 | Tier 2 Token |  |  | item_tier2_token |
| 第3级代币 | Tier 3 Token |  |  | item_tier3_token |
| 第4级代币 | Tier 4 Token |  |  | item_tier4_token |
| 第5级代币 | Tier 5 Token |  |  | item_tier5_token |
| 永恒 | Timeless |  |  | item_enhancement_timeless |
| 永恒遗物 | Timeless Relic |  |  | item_timeless_relic |
| 巨神残铁 | Titan Sliver |  |  | item_titan_sliver |
| 巨神 | Titanic |  |  | item_enhancement_titanic |
| 墓碑 | Tombstone |  |  | item_mutation_tombstone |
| 阿哈利姆之书 | Tome of Aghanim |  |  | item_tome_of_aghanim |
| 知识之书 | Tome of Knowledge |  |  | item_tome_of_knowledge |
| 托莫干伞盖 | Tomo'kan Ringcap |  |  | item_foragers_mana |
| 坚强 | Tough |  |  | item_enhancement_tough |
| 回城卷轴 | Town Portal Scroll |  |  | item_tpscroll |
| 静谧之鞋 | Tranquil Boots |  | 绿鞋 | item_tranquil_boots |
| 欺诈师斗篷 | Trickster Cloak |  |  | item_trickster_cloak |
| 三元重戟 | Trident |  |  | item_trident |
| 可靠铁铲 | Trusty Shovel |  |  | item_trusty_shovel |
| 杂技玩具 | Tumbler's Toy |  |  | item_pogo_stick |
| 极限法球 | Ultimate Orb |  |  | item_ultimate_orb |
| 觉醒 | Unleashed |  |  | item_enhancement_curious |
| 不屈之眼 | Unrelenting Eye |  |  | item_unrelenting_eye |
| 坚毅之件 | Unwavering Condition |  |  | item_unwavering_condition |
| 影之灵龛 | Urn of Shadows |  | 骨灰 | item_urn_of_shadows |
| 臂甲 | Vambrace |  |  | item_vambrace |
| 吸血鬼獠牙 | Vampire Fangs |  |  | item_vampire_fangs |
| 吸血鬼 | Vampiric |  |  | item_enhancement_vampiric |
| 先锋盾 | Vanguard |  |  | item_vanguard |
| 高远 | Vast |  |  | item_enhancement_vast |
| 纷争面纱 | Veil of Discord |  |  | item_veil_of_discord |
| 正义之斧 | Vindicator's Axe |  |  | item_vindicators_axe |
| 活力 | Vital |  |  | item_enhancement_vital |
| 活力伞菌 | Vital Toadstool |  |  | item_foragers_health |
| 活力之球 | Vitality Booster |  |  | item_vitality_booster |
| 弗拉迪米尔的祭品 | Vladmir's Offering |  |  | item_vladmir |
| 虚无宝石 | Void Stone |  |  | item_void_stone |
| 巫毒面具 | Voodoo Mask |  |  | item_voodoo_mask |
| 加重骰子 | Weighted Dice |  |  | item_weighted_dice |
| 邪道私语 | Whisper of the Dread |  |  | item_whisper_of_the_dread |
| 风灵之纹 | Wind Lace |  |  | item_wind_lace |
| 风之杖 | Wind Waker |  |  | item_wind_waker |
| 睿智 | Wise |  |  | item_enhancement_wise |
| 巫师之刃 | Witch Blade |  |  | item_witch_blade |
| 行巫之祸 | Witchbane |  |  | item_heavy_blade |
| 无知小帽 | Witless Shako |  |  | item_witless_shako |
| 巫师帽 | Wizard Hat |  |  | item_wizard_hat |
| 林地神行靴 | Woodland Striders |  |  | item_woodland_striders |
| 怨灵系带 | Wraith Band |  |  | item_wraith_band |
| 怨灵之契 | Wraith Pact |  |  | item_wraith_pact |
| 夜叉 | Yasha |  |  | item_yasha |
| 慧夜对剑 | Yasha and Kaya |  |  | item_yasha_and_kaya |

## 技能（734）

### 亚巴顿 / Abaddon
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 无光之盾 | Aphotic Shield |  |  | abaddon_aphotic_shield |
| 回光返照 | Borrowed Time |  |  | abaddon_borrowed_time |
| 魔霭诅咒 | Curse of Avernus |  |  | abaddon_frostmourne |
| 迷雾缠绕 | Mist Coil |  |  | abaddon_death_coil |
| 凋零迷雾 | Withering Mist |  |  | abaddon_withering_mist |

### 炼金术士 / Alchemist
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 酸性喷雾 | Acid Spray |  |  | alchemist_acid_spray |
| 狂暴药剂 | Berserk Potion |  |  | alchemist_berserk_potion |
| 化学狂暴 | Chemical Rage |  |  | alchemist_chemical_rage |
| 腐蚀兵械 | Corrosive Weaponry |  |  | alchemist_corrosive_weaponry |
| 贪魔的贪婪 | Greevil's Greed |  |  | alchemist_goblins_greed |
| 不稳定化合物 | Unstable Concoction |  |  | alchemist_unstable_concoction |

### 远古冰魄 / Ancient Apparition
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 刺骨严寒 | Bone Chill |  |  | ancient_apparition_bone_chill |
| 极寒之触 | Chilling Touch |  |  | ancient_apparition_chilling_touch |
| 寒霜之足 | Cold Feet |  |  | ancient_apparition_cold_feet |
| 冰晶爆轰 | Ice Blast |  |  | ancient_apparition_ice_blast |
| 冰霜漩涡 | Ice Vortex |  |  | ancient_apparition_ice_vortex |

### 敌法师 / Anti-Mage
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 闪烁 | Blink |  |  | antimage_blink |
| 法术反制 | Counterspell |  |  | antimage_counterspell |
| 法力损毁 | Mana Break |  |  | antimage_mana_break |
| 法力虚空 | Mana Void |  |  | antimage_mana_void |
| 绝人之路 | Persecutor |  |  | antimage_persectur |

### 天穹守望者 / Arc Warden
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 乱流 | Flux |  |  | arc_warden_flux |
| 磁场 | Magnetic Field |  |  | arc_warden_magnetic_field |
| 神符灌注 | Runic Infusion |  |  | arc_warden_runic_infusion |
| 闪光幽魂 | Spark Wraith |  |  | arc_warden_spark_wraith |
| 风暴双雄 | Tempest Double |  |  | arc_warden_tempest_double |

### 斧王 / Axe
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 战斗饥渴 | Battle Hunger |  |  | axe_battle_hunger |
| 狂战士之吼 | Berserker's Call | Call | 吼 | axe_berserkers_call |
| 反击螺旋 | Counter Helix |  |  | axe_counter_helix |
| 淘汰之刃 | Culling Blade | Cull | 淘汰 / 斩杀 | axe_culling_blade |
| 一人之军 | One Man Army |  |  | axe_one_man_army |

### 祸乱之源 / Bane
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 蚀脑 | Brain Sap |  |  | bane_brain_sap |
| 虚弱 | Enfeeble |  |  | bane_enfeeble |
| 魔爪 | Fiend's Grip | Fiend's Grip | 大招拉 / 魔爪 | bane_fiends_grip |
| 妮塔莎脓血 | Ichor of Nyctasha |  |  | bane_ichor_of_nyctasha |
| 噩梦 | Nightmare |  |  | bane_nightmare |

### 蝙蝠骑士 / Batrider
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 火焰飞行 | Firefly |  |  | batrider_firefly |
| 烈焰破击 | Flamebreak |  |  | batrider_flamebreak |
| 燃烧枷锁 | Flaming Lasso |  |  | batrider_flaming_lasso |
| 闷烧树脂 | Smoldering Resin |  |  | batrider_smoldering_resin |
| 粘性燃油 | Sticky Napalm |  |  | batrider_sticky_napalm |

### 兽王 / Beastmaster
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 斯洛姆战鼓 | Drums of Slom |  |  | beastmaster_drums_of_slom |
| 野性之心 | Inner Beast |  |  | beastmaster_inner_beast |
| 原始咆哮 | Primal Roar |  |  | beastmaster_primal_roar |
| 召唤猛禽 | Summon Raptors |  |  | beastmaster_summon_raptor |
| 召唤刀背兽 | Summon Razorback |  |  | beastmaster_summon_razorback |
| 野性之斧 | Wild Axes |  |  | beastmaster_wild_axes |

### 血魔 / Bloodseeker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 血祭 | Blood Rite |  |  | bloodseeker_blood_bath |
| 血怒 | Bloodrage |  |  | bloodseeker_bloodrage |
| 割裂 | Rupture |  |  | bloodseeker_rupture |
| 食血动物 | Sanguivore |  |  | bloodseeker_sanguivore |
| 焦渴 | Thirst |  |  | bloodseeker_thirst |

### 赏金猎人 / Bounty Hunter
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 职业猎人 | Big Game Hunter |  |  | bounty_hunter_big_game_hunter |
| 暗影情谊 | Friendly Shadow |  |  | bounty_hunter_wind_walk_ally |
| 忍术 | Jinada |  |  | bounty_hunter_jinada |
| 暗影步 | Shadow Walk |  |  | bounty_hunter_wind_walk |
| 投掷飞镖 | Shuriken Toss |  |  | bounty_hunter_shuriken_toss |
| 追踪术 | Track |  |  | bounty_hunter_track |

### 酒仙 / Brewmaster
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 余烬佳酿 | Cinder Brew |  |  | brewmaster_cinder_brew |
| 醉拳 | Drunken Brawler |  |  | brewmaster_drunken_brawler |
| 壮胆酒 | Liquid Courage |  |  | brewmaster_liquid_courage |
| 元素分离 | Primal Split |  |  | brewmaster_primal_split |
| 雷霆一击 | Thunder Clap |  |  | brewmaster_thunder_clap |

### 钢背兽 / Bristleback
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 钢毛后背 | Bristleback |  |  | bristleback_bristleback |
| 毛团 | Hairball |  |  | bristleback_hairball |
| 尖刺在背 | Prickly |  |  | bristleback_prickly |
| 刺针扫射 | Quill Spray |  |  | bristleback_quill_spray |
| 粘稠鼻液 | Viscous Nasal Goo |  |  | bristleback_viscous_nasal_goo |
| 战意 | Warpath |  |  | bristleback_warpath |

### 育母蜘蛛 / Broodmother
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 麻痹之咬 | Incapacitating Bite |  |  | broodmother_incapacitating_bite |
| 极度饥渴 | Insatiable Hunger |  |  | broodmother_insatiable_hunger |
| 孵化蜘蛛 | Spawn Spiderlings |  |  | broodmother_spawn_spiderlings |
| 蜘蛛奶 | Spider's Milk |  |  | broodmother_spiders_milk |
| 织网 | Spin Web |  |  | broodmother_spin_web |
| 蛛纱陷阱 | Spinner's Snare |  |  | broodmother_sticky_snare |

### 半人马战行者 / Centaur Warrunner
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 双刃剑 | Double Edge |  |  | centaur_double_edge |
| 马蹄践踏 | Hoof Stomp |  |  | centaur_hoof_stomp |
| 开足马力 | Horsepower |  |  | centaur_horsepower |
| 反伤 | Retaliate |  |  | centaur_return |
| 奔袭冲撞 | Stampede |  |  | centaur_stampede |
| 马到成功 | Work Horse |  |  | centaur_work_horse |

### 混沌骑士 / Chaos Knight
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 混乱之箭 | Chaos Bolt |  |  | chaos_knight_chaos_bolt |
| 混沌一击 | Chaos Strike |  |  | chaos_knight_chaos_strike |
| 基本法则锻造 | Fundamental Forging |  |  | chaos_knight_fundamental_forging |
| 混沌之军 | Phantasm |  |  | chaos_knight_phantasm |
| 实相裂隙 | Reality Rift |  |  | chaos_knight_reality_rift |

### 陈 / Chen
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 神力恩泽 | Divine Favor |  |  | chen_divine_favor |
| 上帝之手 | Hand of God |  |  | chen_hand_of_god |
| 神圣劝化 | Holy Persuasion |  |  | chen_holy_persuasion |
| 赎罪 | Penitence |  |  | chen_penitence |
| 狂热者 | Zealot |  |  | chen_zealot |

### 克林克兹 / Clinkz
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 烈焰之军 | Burning Army |  |  | clinkz_burning_army |
| 炽烈火雨 | Burning Barrage |  |  | clinkz_burning_barrage |
| 死亡契约 | Death Pact |  |  | clinkz_death_pact |
| 地狱之裂 | Infernal Shred |  |  | clinkz_infernal_shred |
| 灼热之箭 | Searing Arrows |  |  | clinkz_searing_arrows |
| 骨隐步 | Skeleton Walk |  |  | clinkz_wind_walk |
| 扫射 | Strafe |  |  | clinkz_strafe |

### 发条技师 / Clockwerk
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 装甲力量 | Armor Power |  |  | rattletrap_armor_power |
| 弹幕冲击 | Battery Assault |  |  | rattletrap_battery_assault |
| 发射钩爪 | Hookshot |  | 发条大 | rattletrap_hookshot |
| 喷气背包 | Jetpack |  |  | rattletrap_jetpack |
| 超速运转 | Overclocking |  |  | rattletrap_overclocking |
| 能量齿轮 | Power Cogs |  |  | rattletrap_power_cogs |
| 照明火箭 | Rocket Flare |  |  | rattletrap_rocket_flare |

### 水晶室女 / Crystal Maiden
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 奥术光环 | Arcane Aura |  |  | crystal_maiden_brilliance_aura |
| 冰晶克隆 | Crystal Clone |  |  | crystal_maiden_crystal_clone |
| 冰霜新星 | Crystal Nova |  |  | crystal_maiden_crystal_nova |
| 极寒领域 | Freezing Field |  |  | crystal_maiden_freezing_field |
| 冰封禁制 | Frostbite |  |  | crystal_maiden_frostbite |
| 冰川护体 | Glacial Guard |  |  | crystal_maiden_glacial_guard |

### 黑暗贤者 / Dark Seer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 离子外壳 | Ion Shell |  |  | dark_seer_ion_shell |
| 普通一拳 | Normal Punch |  |  | dark_seer_normal_punch |
| 才思敏捷 | Quick Wit |  |  | dark_seer_aggrandize |
| 奔腾 | Surge |  |  | dark_seer_surge |
| 真空 | Vacuum |  |  | dark_seer_vacuum |
| 复制之墙 | Wall of Replica |  |  | dark_seer_wall_of_replica |

### 邪影芳灵 / Dark Willow
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 作祟 | Bedlam |  |  | dark_willow_bedlam |
| 荆棘迷宫 | Bramble Maze |  |  | dark_willow_bramble_maze |
| 诅咒王冠 | Cursed Crown |  |  | dark_willow_cursed_crown |
| 仙灵粉尘 | Pixie Dust |  |  | dark_willow_pixie_dust |
| 暗影之境 | Shadow Realm |  |  | dark_willow_shadow_realm |
| 恐吓 | Terrorize |  |  | dark_willow_terrorize |

### 破晓辰星 / Dawnbreaker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 辰星破晓 | Break of Dawn |  |  | dawnbreaker_break_of_dawn |
| 上界重锤 | Celestial Hammer |  |  | dawnbreaker_celestial_hammer |
| 熠熠生辉 | Luminosity |  |  | dawnbreaker_luminosity |
| 天光现世 | Solar Guardian |  |  | dawnbreaker_solar_guardian |
| 星破天惊 | Starbreaker |  |  | dawnbreaker_fire_wreath |

### 戴泽 / Dazzle
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 虚无投影 | Nothl Projection |  |  | dazzle_nothl_projection |
| 剧毒之触 | Poison Touch |  |  | dazzle_poison_touch |
| 暗影波 | Shadow Wave |  |  | dazzle_shadow_wave |
| 薄葬 | Shallow Grave |  |  | dazzle_shallow_grave |
| 编织 | Weave |  |  | dazzle_innate_weave |

### 死亡先知 / Death Prophet
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 地穴虫群 | Crypt Swarm |  |  | death_prophet_carrion_swarm |
| 驱使恶灵 | Exorcism |  |  | death_prophet_exorcism |
| 沉默魔法 | Silence |  |  | death_prophet_silence |
| 吸魂巫术 | Spirit Siphon |  |  | death_prophet_spirit_siphon |
| 巫术精研 | Witchcraft |  |  | death_prophet_witchcraft |

### 干扰者 / Disruptor
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 电磁排斥 | Electromagnetic Repulsion |  |  | disruptor_electromagnetic_repulsion |
| 恶念瞥视 | Glimpse |  |  | disruptor_glimpse |
| 动能栅栏 | Kinetic Fence |  |  | disruptor_kinetic_fence |
| 动能力场 | Kinetic Field |  |  | disruptor_kinetic_field |
| 静态风暴 | Static Storm |  | 静态风暴 | disruptor_static_storm |
| 风雷之击 | Thunder Strike |  |  | disruptor_thunder_strike |

### 末日使者 / Doom
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 吞噬 | Devour |  |  | doom_bringer_devour |
| 末日 | Doom |  | 末日 | doom_bringer_doom |
| 阎刃 | Infernal Blade |  |  | doom_bringer_infernal_blade |
| 等级？痛苦 | Lvl ? Pain |  |  | doom_bringer_lvl_pain |
| 焦土 | Scorched Earth |  |  | doom_bringer_scorched_earth |

### 龙骑士 / Dragon Knight
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 火焰气息 | Breathe Fire |  |  | dragon_knight_breathe_fire |
| 龙族血统 | Dragon Blood |  |  | dragon_knight_dragon_blood |
| 神龙摆尾 | Dragon Tail |  |  | dragon_knight_dragon_tail |
| 古龙形态 | Elder Dragon Form |  |  | dragon_knight_elder_dragon_form |
| 龙炎火球 | Fireball |  |  | dragon_knight_fireball |
| 飞龙之怒 | Wyrm's Wrath |  |  | dragon_knight_wyrms_wrath |

### 卓尔游侠 / Drow Ranger
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 霜冻之箭 | Frost Arrows |  |  | drow_ranger_frost_arrows |
| 冰川 | Glacier |  |  | drow_ranger_glacier |
| 狂风 | Gust |  |  | drow_ranger_wave_of_silence |
| 射手天赋 | Marksmanship |  |  | drow_ranger_marksmanship |
| 数箭齐发 | Multishot |  |  | drow_ranger_multishot |
| 精准光环 | Precision Aura |  |  | drow_ranger_trueshot |

### 大地之灵 / Earth Spirit
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 巨石冲击 | Boulder Smash |  |  | earth_spirit_boulder_smash |
| 残岩魔咒 | Enchant Remnant |  |  | earth_spirit_petrify |
| 地磁之握 | Geomagnetic Grip |  |  | earth_spirit_geomagnetic_grip |
| 磁化 | Magnetize |  |  | earth_spirit_magnetize |
| 巨石翻滚 | Rolling Boulder |  |  | earth_spirit_rolling_boulder |
| 残岩 | Stone Remnant |  |  | earth_spirit_stone_caller |

### 撼地者 / Earthshaker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 余震 | Aftershock |  |  | earthshaker_aftershock |
| 回音击 | Echo Slam | Echo | 沟壑大 / 回音击 | earthshaker_echo_slam |
| 强化图腾 | Enchant Totem |  |  | earthshaker_enchant_totem |
| 沟壑 | Fissure |  |  | earthshaker_fissure |
| 强击图腾 | Slugger |  |  | earthshaker_slugger |

### 上古巨神 / Elder Titan
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 灵体游魂 | Astral Spirit |  |  | elder_titan_ancestral_spirit |
| 裂地沟壑 | Earth Splitter |  |  | elder_titan_earth_splitter |
| 回音重踏 | Echo Stomp |  |  | elder_titan_echo_stomp |
| 动量 | Momentum |  |  | elder_titan_momentum |
| 自然秩序 | Natural Order |  |  | elder_titan_natural_order |

### 灰烬之灵 / Ember Spirit
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 激活残焰 | Activate Fire Remnant |  |  | ember_spirit_activate_fire_remnant |
| 残焰 | Fire Remnant |  |  | ember_spirit_fire_remnant |
| 烈火罩 | Flame Guard |  |  | ember_spirit_flame_guard |
| 献祭心 | Immolation |  |  | ember_spirit_immolation |
| 炎阳索 | Searing Chains |  |  | ember_spirit_searing_chains |
| 无影拳 | Sleight of Fist |  |  | ember_spirit_sleight_of_fist |

### 魅惑魔女 / Enchantress
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 魅惑 | Enchant |  |  | enchantress_enchant |
| 推进 | Impetus |  |  | enchantress_impetus |
| 密友 | Little Friends |  |  | enchantress_little_friends |
| 自然之助 | Nature's Attendants |  |  | enchantress_natures_attendants |
| 煽动野怪 | Rabble-Rouser |  |  | enchantress_rabblerouser |
| 跃动 | Sproink |  |  | enchantress_bunny_hop |
| 不可侵犯 | Untouchable |  |  | enchantress_untouchable |

### 谜团 / Enigma
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 黑洞 | Black Hole |  | 黑洞 | enigma_black_hole |
| 恶魔召唤 | Demonic Summoning |  |  | enigma_demonic_conversion |
| 事件视界 | Event Horizon |  |  | enigma_event_horizon |
| 憎恶 | Malefice |  |  | enigma_malefice |
| 午夜凋零 | Midnight Pulse |  |  | enigma_midnight_pulse |

### 虚空假面 / Faceless Void
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 时间结界 | Chronosphere | Chrono | 大招罩 / 时间结界 | faceless_void_chronosphere |
| 扭曲力场 | Distortion Field |  |  | faceless_void_distortion_field |
| 反时间漫游 | Reverse Time Walk |  |  | faceless_void_time_walk_reverse |
| 时间膨胀 | Time Dilation |  |  | faceless_void_time_dilation |
| 时间锁定 | Time Lock |  |  | faceless_void_time_lock |
| 时间漫游 | Time Walk |  |  | faceless_void_time_walk |

### 天涯墨客 / Grimstroke
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 暗绘 | Dark Portrait |  |  | grimstroke_dark_portrait |
| 墨涌 | Ink Swell |  |  | grimstroke_spirit_walk |
| 墨痕 | Ink Trail |  |  | grimstroke_ink_trail |
| 戾影 | Phantom's Embrace |  |  | grimstroke_ink_creature |
| 缚魂 | Soulbind |  |  | grimstroke_soul_chain |
| 绝笔 | Stroke of Fate |  |  | grimstroke_dark_artistry |

### 矮人直升机 / Gyrocopter
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 加力燃烧器 | Afterburner |  |  | gyrocopter_afterburner |
| 召唤飞弹 | Call Down |  |  | gyrocopter_call_down |
| 高射火炮 | Flak Cannon |  |  | gyrocopter_flak_cannon |
| 追踪导弹 | Homing Missile |  |  | gyrocopter_homing_missile |
| 火箭弹幕 | Rocket Barrage |  |  | gyrocopter_rocket_barrage |
| 侧翼机枪 | Side Gunner |  |  | gyrocopter_side_gunner_spawn_ability |

### 森海飞霞 / Hoodwink
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 爆栗出击 | Acorn Shot |  |  | hoodwink_acorn_shot |
| 野地奇袭 | Bushwhack |  |  | hoodwink_bushwhack |
| 诱敌奇术 | Decoy |  |  | hoodwink_decoy |
| 猎手旋镖 | Hunter's Boomerang |  |  | hoodwink_hunters_boomerang |
| 林渊旅人 | Mistwoods Wayfarer |  |  | hoodwink_mistwoods_wayfarer |
| 密林奔走 | Scurry |  |  | hoodwink_scurry |
| 一箭穿心 | Sharpshooter |  |  | hoodwink_sharpshooter |

### 哈斯卡 / Huskar
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 狂战士之血 | Berserker's Blood |  |  | huskar_berserkers_blood |
| 血魔法 | Blood Magic |  |  | huskar_blood_magic |
| 沸血之矛 | Burning Spear |  |  | huskar_burning_spear |
| 心炎 | Inner Fire |  |  | huskar_inner_fire |
| 牺牲 | Life Break |  |  | huskar_life_break |

### 祈求者 / Invoker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 灵动迅捷 | Alacrity |  |  | invoker_alacrity |
| 混沌陨石 | Chaos Meteor |  |  | invoker_chaos_meteor |
| 急速冷却 | Cold Snap |  |  | invoker_cold_snap |
| 超震声波 | Deafening Blast |  |  | invoker_deafening_blast |
| 电磁脉冲 | E.M.P. |  |  | invoker_emp |
| 火 | Exort |  |  | invoker_exort |
| 熔炉精灵 | Forge Spirit |  |  | invoker_forge_spirit |
| 幽灵漫步 | Ghost Walk |  |  | invoker_ghost_walk |
| 寒冰之墙 | Ice Wall |  |  | invoker_ice_wall |
| 元素祈唤 | Invoke |  |  | invoker_invoke |
| 冰 | Quas |  |  | invoker_quas |
| 阳炎冲击 | Sun Strike |  |  | invoker_sun_strike |
| 强袭飓风 | Tornado |  |  | invoker_tornado |
| 雷 | Wex |  |  | invoker_wex |

### 艾欧 / Io
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 衡势 | Equilibrium |  |  | wisp_equilibrium |
| 过载 | Overcharge |  |  | wisp_overcharge |
| 降临 | Relocate |  |  | wisp_relocate |
| 幽魂 | Spirits |  |  | wisp_spirits |
| 拉近幽魂 | Spirits In |  |  | wisp_spirits_in |
| 拉远幽魂 | Spirits Out |  |  | wisp_spirits_out |
| 羁绊 | Tether |  |  | wisp_tether |

### 杰奇洛 / Jakiro
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 天生一对 | Double Trouble |  |  | jakiro_double_trouble |
| 冰火交加 | Dual Breath |  |  | jakiro_dual_breath |
| 冰封路径 | Ice Path |  |  | jakiro_ice_path |
| 液态火 | Liquid Fire |  |  | jakiro_liquid_fire |
| 液态冰 | Liquid Frost |  |  | jakiro_liquid_ice |
| 烈焰焚身 | Macropyre |  |  | jakiro_macropyre |

### 主宰 / Juggernaut
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 剑舞 | Blade Dance |  |  | juggernaut_blade_dance |
| 剑刃风暴 | Blade Fury |  |  | juggernaut_blade_fury |
| 剑心犹在 | Bladeform |  |  | juggernaut_bladeform |
| 治疗守卫 | Healing Ward |  |  | juggernaut_healing_ward |
| 无敌斩 | Omnislash |  |  | juggernaut_omni_slash |
| 迅风斩 | Swiftslash |  |  | juggernaut_swift_slash |

### 光之守卫 / Keeper of the Light
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 致盲之光 | Blinding Light |  |  | keeper_of_the_light_blinding_light |
| 光明速度 | Bright Speed |  |  | keeper_of_the_light_bright_speed |
| 查克拉魔法 | Chakra Magic |  |  | keeper_of_the_light_chakra_magic |
| 冲击波 | Illuminate |  |  | keeper_of_the_light_illuminate |
| 炎阳之缚 | Solar Bind |  |  | keeper_of_the_light_radiant_bind |
| 灵魂形态 | Spirit Form |  |  | keeper_of_the_light_spirit_form |
| 灵光 | Will-O-Wisp |  |  | keeper_of_the_light_will_o_wisp |

### 凯 / Kez
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 回音重斩 | Echo Slash |  |  | kez_echo_slash |
| 天隼冲击 | Falcon Rush |  |  | kez_falcon_rush |
| 制敌爪钩 | Grappling Claw |  |  | kez_grappling_claw |
| 影武长刀 | Kazurai Katana |  |  | kez_kazurai_katana |
| 猛禽之舞 | Raptor Dance |  |  | kez_raptor_dance |
| 渡鸦之纱 | Raven's Veil |  |  | kez_ravens_veil |
| 翔影之钗 | Shodo Sai |  |  | kez_shodo_sai |
| 流派变换 | Switch Discipline |  |  | kez_switch_weapons |
| 利爪飞掷 | Talon Toss |  |  | kez_talon_toss |

### 昆卡 / Kunkka
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 统帅朗姆酒 | Admiral's Rum |  |  | kunkka_admirals_rum |
| 幽灵船 | Ghostship |  |  | kunkka_ghostship |
| 潮汐波 | Tidal Wave |  |  | kunkka_tidal_wave |
| 潮汐使者 | Tidebringer |  |  | kunkka_tidebringer |
| 洪流 | Torrent |  |  | kunkka_torrent |
| X标记 | X Marks the Spot |  |  | kunkka_x_marks_the_spot |

### 朗戈 / Largo
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 两栖狂想曲 | Amphibian Rhapsody |  |  | largo_amphibian_rhapsody |
| 巨腹闪电战 | Bullbelly Blitz |  |  | largo_song_fight_song |
| 动人之舐 | Catchy Lick |  |  | largo_catchy_lick |
| 灵呱一闪 | Croak of Genius |  |  | largo_croak_of_genius |
| 安可 | Encore |  |  | largo_encore |
| 蛙力千钧 | Frogstomp |  |  | largo_frogstomp |
| 疾步生风 | Hotfeet Hustle |  |  | largo_song_double_time |
| 大屿灵药 | Island Elixir |  |  | largo_song_good_vibrations |

### 军团指挥官 / Legion Commander
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 决斗 | Duel |  | 决斗 | legion_commander_duel |
| 勇气之霎 | Moment of Courage |  |  | legion_commander_moment_of_courage |
| 迎难而战！ | Outfight Them! |  |  | legion_commander_outfight_them |
| 压倒性优势 | Overwhelming Odds |  |  | legion_commander_overwhelming_odds |
| 强攻 | Press The Attack |  |  | legion_commander_press_the_attack |

### 拉席克 / Leshrac
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 大肆污染 | Defilement |  |  | leshrac_defilement |
| 恶魔敕令 | Diabolic Edict |  |  | leshrac_diabolic_edict |
| 闪电风暴 | Lightning Storm |  |  | leshrac_lightning_storm |
| 虚无主义 | Nihilism |  |  | leshrac_greater_lightning_storm |
| 脉冲新星 | Pulse Nova |  |  | leshrac_pulse_nova |
| 撕裂大地 | Split Earth |  |  | leshrac_split_earth |

### 巫妖 / Lich
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 连环霜冻 | Chain Frost |  |  | lich_chain_frost |
| 寒霜爆发 | Frost Blast |  |  | lich_frost_nova |
| 冰霜魔盾 | Frost Shield |  |  | lich_frost_shield |
| 寒冰尖柱 | Ice Spire |  |  | lich_ice_spire |
| 献身 | Sacrifice |  |  | lich_death_charge |
| 阴邪凝视 | Sinister Gaze |  |  | lich_sinister_gaze |

### 噬魂鬼 / Lifestealer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 盛宴 | Feast |  |  | life_stealer_feast |
| 尸鬼狂怒 | Ghoul Frenzy |  |  | life_stealer_ghoul_frenzy |
| 感染 | Infest |  |  | life_stealer_infest |
| 撕裂伤口 | Open Wounds |  |  | life_stealer_open_wounds |
| 狂暴 | Rage |  |  | life_stealer_rage |

### 莉娜 / Lina
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 龙破斩 | Dragon Slave |  |  | lina_dragon_slave |
| 炽魂 | Fiery Soul |  |  | lina_fiery_soul |
| 腾焰斗篷 | Flame Cloak |  |  | lina_flame_cloak |
| 神灭斩 | Laguna Blade | Laguna | 神灭斩 | lina_laguna_blade |
| 光击阵 | Light Strike Array |  |  | lina_light_strike_array |
| 慢热 | Slow Burn |  |  | lina_slow_burn |

### 莱恩 / Lion
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 裂地尖刺 | Earth Spike |  |  | lion_impale |
| 死亡之指 | Finger of Death | Finger | 死亡一指 | lion_finger_of_death |
| 妖术 | Hex |  |  | lion_voodoo |
| 法力吸取 | Mana Drain |  |  | lion_mana_drain |
| 下地狱再上来 | To Hell and Back |  |  | lion_to_hell_and_back |

### 独行德鲁伊 / Lone Druid
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 缠绕之根 | Entangle |  |  | lone_druid_entangle |
| 野蛮咆哮 | Savage Roar |  |  | lone_druid_savage_roar |
| 灵魂链接 | Spirit Link |  |  | lone_druid_spirit_link |
| 熊灵伙伴 | Summon Spirit Bear |  |  | lone_druid_spirit_bear |
| 真熊形态 | True Form |  |  | lone_druid_true_form |

### 露娜 / Luna
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 月蚀 | Eclipse |  |  | luna_eclipse |
| 月光 | Lucent Beam |  |  | luna_lucent_beam |
| 月之祝福 | Lunar Blessing |  |  | luna_lunar_blessing |
| 环月 | Lunar Orbit |  |  | luna_lunar_orbit |
| 月刃 | Moon Glaives |  |  | luna_moon_glaive |

### 狼人 / Lycan
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 顶级掠食者 | Apex Predator |  |  | lycan_apex_predator |
| 野性驱使 | Feral Impulse |  |  | lycan_feral_impulse |
| 嗥叫 | Howl |  |  | lycan_howl |
| 变身 | Shapeshift |  |  | lycan_shapeshift |
| 召狼 | Summon Wolves |  |  | lycan_summon_wolves |
| 饿狼撕咬 | Wolf Bite |  |  | lycan_wolf_bite |

### 马格纳斯 / Magnus
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 授予力量 | Empower |  |  | magnataur_empower |
| 长角抛物 | Horn Toss |  |  | magnataur_horn_toss |
| 两极反转 | Reverse Polarity | RP | 两极反转 | magnataur_reverse_polarity |
| 震荡波 | Shockwave |  |  | magnataur_shockwave |
| 巨角冲撞 | Skewer |  |  | magnataur_skewer |
| 坚固核心 | Solid Core |  |  | magnataur_solid_core |

### 玛西 / Marci
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 护卫术 | Bodyguard |  |  | marci_bodyguard |
| 过肩摔 | Dispose |  |  | marci_grapple |
| 回身踢 | Rebound |  |  | marci_companion_run |
| 特快专递 | Special Delivery |  |  | marci_special_delivery |
| 怒拳破 | Unleash |  |  | marci_unleash |

### 玛尔斯 / Mars
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 热血竞技场 | Arena Of Blood |  |  | mars_arena_of_blood |
| 护身甲盾 | Bulwark |  |  | mars_bulwark |
| 无畏 | Dauntless |  |  | mars_dauntless |
| 神之谴戒 | God's Rebuke |  |  | mars_gods_rebuke |
| 战神迅矛 | Spear of Mars |  |  | mars_spear |

### 美杜莎 / Medusa
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 冷血动物 | Cold Blooded |  |  | medusa_cold_blooded |
| 罗网箭阵 | Gorgon's Grasp |  |  | medusa_gorgon_grasp |
| 魔法盾 | Mana Shield |  |  | medusa_mana_shield |
| 秘术异蛇 | Mystic Snake |  |  | medusa_mystic_snake |
| 分裂箭 | Split Shot |  |  | medusa_split_shot |
| 石化凝视 | Stone Gaze |  |  | medusa_stone_gaze |

### 米波 / Meepo
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 掘地 | Dig |  |  | meepo_petrify |
| 分则能成 | Divided We Stand |  |  | meepo_divided_we_stand |
| 地之束缚 | Earthbind |  |  | meepo_earthbind |
| 地卜术 | Geomancy |  |  | meepo_geomancy |
| 超大米波 | MegaMeepo |  |  | meepo_megameepo |
| 超大米波摔扔 | MegaMeepo Fling |  |  | meepo_megameepo_fling |
| 忽悠 | Poof |  |  | meepo_poof |
| 洗劫 | Ransack |  |  | meepo_ransack |

### 米拉娜 / Mirana
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 天界箭袋 | Celestial Quiver |  |  | mirana_celestial_quiver |
| 跳跃 | Leap |  |  | mirana_leap |
| 月之暗面 | Moonlight Shadow |  |  | mirana_invis |
| 月神之箭 | Sacred Arrow |  |  | mirana_arrow |
| 群星风暴 | Starstorm |  |  | mirana_starfall |

### 齐天大圣 / Monkey King
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 棒击大地 | Boundless Strike |  |  | monkey_king_boundless_strike |
| 出神入化 | Changing of the Guard |  |  | monkey_king_transfiguration |
| 如意棒法 | Jingu Mastery |  |  | monkey_king_jingu_mastery |
| 七十二变 | Mischief |  |  | monkey_king_mischief |
| 丛林之舞 | Tree Dance |  |  | monkey_king_tree_dance |
| 猴子猴孙 | Wukong's Command |  |  | monkey_king_wukongs_command |

### 变体精灵 / Morphling
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 变体打击 | Adaptive Strike |  |  | morphling_adaptive_strike_agi |
| 属性变换（敏捷获取） | Attribute Shift (Agility Gain) |  |  | morphling_morph_agi |
| 属性变换（力量获取） | Attribute Shift (Strength Gain) |  |  | morphling_morph_str |
| 潮涨潮落 | Ebb and Flow |  |  | morphling_ebb_and_flow |
| 变形 | Morph |  |  | morphling_replicate |
| 波浪形态 | Waveform |  |  | morphling_waveform |

### 琼英碧灵 / Muerta
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 弹无虚发 | Dead Shot |  |  | muerta_dead_shot |
| 神枪在手 | Gunslinger |  |  | muerta_gunslinger |
| 越界 | Pierce the Veil |  |  | muerta_pierce_the_veil |
| 幽魂子弹 | Spectral Slug |  |  | muerta_spectral_slug |
| 超自然 | Supernatural |  |  | muerta_supernatural |
| 唤魂 | The Calling |  |  | muerta_the_calling |

### 娜迦海妖 / Naga Siren
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 鳗鱼皮 | Eelskin |  |  | naga_siren_eelskin |
| 诱捕 | Ensnare |  |  | naga_siren_ensnare |
| 镜像 | Mirror Image |  |  | naga_siren_mirror_image |
| 激流 | Rip Tide |  |  | naga_siren_rip_tide |
| 海妖之歌 | Song of the Siren |  |  | naga_siren_song_of_the_siren |

### 自然先知 / Nature's Prophet
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 青森诅咒 | Curse of the Oldgrowth |  |  | furion_curse_of_the_forest |
| 自然的呼唤 | Nature's Call |  |  | furion_force_of_nature |
| 丛林之魂 | Spirit of the Forest |  |  | furion_spirit_of_the_forest |
| 发芽 | Sprout |  |  | furion_sprout |
| 传送 | Teleportation |  | 飞 | furion_teleportation |
| 自然之怒 | Wrath of Nature |  |  | furion_wrath_of_nature |

### 瘟疫法师 / Necrophos
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 死亡脉冲 | Death Pulse |  |  | necrolyte_death_pulse |
| 死亡搜寻 | Death Seeker |  |  | necrolyte_death_seeker |
| 幽魂护罩 | Ghost Shroud |  |  | necrolyte_ghost_shroud |
| 竭心光环 | Heartstopper Aura |  |  | necrolyte_heartstopper_aura |
| 死神镰刀 | Reaper's Scythe | Reaper's Scythe / Reaper | 镰刀 | necrolyte_reapers_scythe |
| 施虐之心 | Sadist |  |  | necrolyte_sadist |

### 暗夜魔王 / Night Stalker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 伤残恐惧 | Crippling Fear |  |  | night_stalker_crippling_fear |
| 黑暗飞升 | Dark Ascension |  |  | night_stalker_darkness |
| 暗夜猎影 | Hunter in the Night |  |  | night_stalker_hunter_in_the_night |
| 午夜盛宴 | Midnight Feast |  |  | night_stalker_midnight_feast |
| 虚空 | Void |  |  | night_stalker_void |

### 司夜刺客 / Nyx Assassin
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 钻地 | Burrow |  |  | nyx_assassin_burrow |
| 穿刺 | Impale |  |  | nyx_assassin_impale |
| 法力燃烧 | Mana Burn |  |  | nyx_assassin_neuro_sting |
| 神智爆裂 | Mind Flare |  |  | nyx_assassin_jolt |
| 尖刺外壳 | Spiked Carapace |  |  | nyx_assassin_spiked_carapace |
| 复仇 | Vendetta |  |  | nyx_assassin_vendetta |

### 食人魔魔法师 / Ogre Magi
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 嗜血术 | Bloodlust |  |  | ogre_magi_bloodlust |
| 傻福 | Dumb Luck |  |  | ogre_magi_dumb_luck |
| 烈火护盾 | Fire Shield |  |  | ogre_magi_smash |
| 火焰爆轰 | Fireblast |  |  | ogre_magi_fireblast |
| 引燃 | Ignite |  |  | ogre_magi_ignite |
| 多重施法 | Multicast |  |  | ogre_magi_multicast |
| 未精通的火焰爆轰 | Unrefined Fireblast |  |  | ogre_magi_unrefined_fireblast |

### 全能骑士 / Omniknight
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 退化光环 | Degen Aura |  |  | omniknight_degen_aura |
| 守护天使 | Guardian Angel |  |  | omniknight_guardian_angel |
| 纯洁之锤 | Hammer of Purity |  |  | omniknight_hammer_of_purity |
| 洗礼 | Purification |  |  | omniknight_purification |
| 驱逐 | Repel |  |  | omniknight_martyr |

### 神谕者 / Oracle
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 虚妄之诺 | False Promise |  |  | oracle_false_promise |
| 命运敕令 | Fate's Edict |  |  | oracle_fates_edict |
| 气运之末 | Fortune's End |  |  | oracle_fortunes_end |
| 预言 | Prognosticate |  |  | oracle_prognosticate |
| 涤罪之焰 | Purifying Flames |  |  | oracle_purifying_flames |
| 天命之雨 | Rain of Destiny |  |  | oracle_rain_of_destiny |

### 殁境神蚀者 / Outworld Destroyer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 奥术天球 | Arcane Orb |  |  | obsidian_destroyer_arcane_orb |
| 星体禁锢 | Astral Imprisonment |  |  | obsidian_destroyer_astral_imprisonment |
| 精华变迁 | Essence Flux |  |  | obsidian_destroyer_equilibrium |
| 责难 | Objurgation |  |  | obsidian_destroyer_objurgation |
| 神智之蚀 | Sanity's Eclipse |  |  | obsidian_destroyer_sanity_eclipse |

### 石鳞剑士 / Pangolier
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 天佑勇者 | Fortune Favors the Bold |  |  | pangolier_fortune_favors_the_bold |
| 幸运一击 | Lucky Shot |  |  | pangolier_lucky_shot |
| 卷土重来 | Roll Up |  |  | pangolier_rollup |
| 地雷滚滚 | Rolling Thunder |  |  | pangolier_gyroshell |
| 甲盾冲击 | Shield Crash |  |  | pangolier_shield_crash |
| 虚张声势 | Swashbuckle |  |  | pangolier_swashbuckle |

### 幻影刺客 / Phantom Assassin
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 魅影无形 | Blur |  |  | phantom_assassin_blur |
| 恩赐解脱 | Coup de Grace |  |  | phantom_assassin_coup_de_grace |
| 刀阵旋风 | Fan of Knives |  |  | phantom_assassin_fan_of_knives |
| 飘忽不定 | Immaterial |  |  | phantom_assassin_immaterial |
| 幻影突袭 | Phantom Strike |  |  | phantom_assassin_phantom_strike |
| 窒碍短匕 | Stifling Dagger |  |  | phantom_assassin_stifling_dagger |

### 幻影长矛手 / Phantom Lancer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 神行百变 | Doppelganger |  |  | phantom_lancer_doppelwalk |
| 灵幻兵械 | Illusory Armaments |  |  | phantom_lancer_illusory_armaments |
| 并列 | Juxtapose |  |  | phantom_lancer_juxtapose |
| 幻影冲锋 | Phantom Rush |  |  | phantom_lancer_phantom_edge |
| 灵魂之矛 | Spirit Lance |  |  | phantom_lancer_spirit_lance |

### 凤凰 / Phoenix
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 消逝之光 | Dying Light |  |  | phoenix_dying_light |
| 烈火精灵 | Fire Spirits |  |  | phoenix_fire_spirits |
| 凤凰冲击 | Icarus Dive |  |  | phoenix_icarus_dive |
| 烈日炙烤 | Sun Ray |  |  | phoenix_sun_ray |
| 超新星 | Supernova | Egg | 变蛋 | phoenix_supernova |

### 獸 / Primal Beast
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 庞 | Colossal |  |  | primal_beast_colossal |
| 突 | Onslaught |  |  | primal_beast_onslaught |
| 捶 | Pulverize |  |  | primal_beast_pulverize |
| 砸 | Rock Throw |  |  | primal_beast_rock_throw |
| 踏 | Trample |  |  | primal_beast_trample |
| 咤 | Uproar |  |  | primal_beast_uproar |

### 帕克 / Puck
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 梦境缠绕 | Dream Coil | Coil | 梦境缠绕 | puck_dream_coil |
| 幻象法球 | Illusory Orb |  |  | puck_illusory_orb |
| 相位转移 | Phase Shift |  |  | puck_phase_shift |
| 顽皮克敌 | Puckish |  |  | puck_puckish |
| 新月之痕 | Waning Rift |  |  | puck_waning_rift |

### 帕吉 / Pudge
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 肢解 | Dismember |  |  | pudge_dismember |
| 腐肉堆积 | Flesh Heap |  |  | pudge_innate_graft_flesh |
| 肉钩 | Meat Hook | Hook | 钩子 | pudge_meat_hook |
| 肉盾 | Meat Shield |  |  | pudge_flesh_heap |
| 腐烂 | Rot |  |  | pudge_rot |

### 帕格纳 / Pugna
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 衰老 | Decrepify |  |  | pugna_decrepify |
| 生命汲取 | Life Drain |  |  | pugna_life_drain |
| 幽冥爆轰 | Nether Blast |  |  | pugna_nether_blast |
| 幽冥守卫 | Nether Ward |  |  | pugna_nether_ward |
| 湮灭专家 | Oblivion Savant |  |  | pugna_oblivion_savant |

### 痛苦女王 / Queen of Pain
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 闪烁 | Blink |  |  | queenofpain_blink |
| 痛苦尖叫 | Scream Of Pain |  |  | queenofpain_scream_of_pain |
| 暗影突袭 | Shadow Strike |  |  | queenofpain_shadow_strike |
| 超声冲击波 | Sonic Wave |  |  | queenofpain_sonic_wave |
| 魅魔 | Succubus |  |  | queenofpain_succubus |

### 雷泽 / Razor
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 风暴之眼 | Eye of the Storm |  |  | razor_eye_of_the_storm |
| 等离子场 | Plasma Field |  |  | razor_plasma_field |
| 静电连接 | Static Link |  |  | razor_static_link |
| 风暴涌动 | Storm Surge |  |  | razor_storm_surge |
| 不稳定电流 | Unstable Current |  |  | razor_unstable_current |

### 力丸 / Riki
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 背刺 | Backstab |  |  | riki_innate_backstab |
| 闪烁突袭 | Blink Strike |  |  | riki_blink_strike |
| 刀光谍影 | Cloak and Dagger |  |  | riki_backstab |
| 烟幕 | Smoke Screen |  |  | riki_smoke_screen |
| 绝杀秘技 | Tricks of the Trade |  |  | riki_tricks_of_the_trade |

### 百戏大王 / Ringmaster
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 暗黑狂欢主持 | Dark Carnival Barker |  |  | ringmaster_dark_carnival_souvenirs |
| 逃生技 | Escape Act |  |  | ringmaster_the_box |
| 哈哈镜 | Funhouse Mirror |  |  | ringmaster_funhouse_mirror |
| 尖刀戏 | Impalement Arts |  |  | ringmaster_impalement |
| 聚光灯 | Spotlight |  |  | ringmaster_spotlight |
| 强力水 | Strongman Tonic |  |  | ringmaster_strongman_tonic |
| 驯兽术 | Tame the Beasts |  |  | ringmaster_tame_the_beasts |
| 独轮车 | Unicycle |  |  | ringmaster_summon_unicycle |
| 奇观轮 | Wheel of Wonder |  |  | ringmaster_wheel |
| 整蛊垫 | Whoopee Cushion |  |  | ringmaster_whoopee_cushion |

### 拉比克 / Rubick
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 奥术至尊 | Arcane Supremacy |  |  | rubick_arcane_supremacy |
| 奇心 | Curiosity |  |  | rubick_curiosity |
| 弱化能流 | Fade Bolt |  |  | rubick_fade_bolt |
| 技能窃取 | Spell Steal |  |  | rubick_spell_steal |
| 隔空取物 | Telekinesis |  |  | rubick_telekinesis |

### 沙王 / Sand King
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 掘地穿刺 | Burrowstrike |  |  | sandking_burrowstrike |
| 腐尸毒 | Caustic Finale |  |  | sandking_caustic_finale |
| 地震 | Epicenter |  |  | sandking_epicenter |
| 沙尘暴 | Sand Storm |  |  | sandking_sand_storm |
| 尾刺 | Stinger |  |  | sandking_scorpion_strike |

### 暗影恶魔 / Shadow Demon
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 邪恶净愈 | Demonic Cleanse |  |  | shadow_demon_demonic_cleanse |
| 邪恶净化 | Demonic Purge |  |  | shadow_demon_demonic_purge |
| 崩裂禁锢 | Disruption |  |  | shadow_demon_disruption |
| 散播 | Disseminate |  |  | shadow_demon_disseminate |
| 威胁 | Menace |  |  | shadow_demon_menace |
| 暗影剧毒 | Shadow Poison |  |  | shadow_demon_shadow_poison |

### 影魔 / Shadow Fiend
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 灵魂盛宴 | Feast of Souls |  |  | nevermore_frenzy |
| 支配死灵 | Necromastery |  |  | nevermore_necromastery |
| 魔王降临 | Presence of the Dark Lord |  |  | nevermore_dark_lord |
| 魂之挽歌 | Requiem of Souls |  |  | nevermore_requiem |
| 毁灭阴影 | Shadowraze |  |  | nevermore_shadowraze1 |

### 暗影萨满 / Shadow Shaman
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 苍穹震击 | Ether Shock |  |  | shadow_shaman_ether_shock |
| 禽戏 | Fowl Play |  |  | shadow_shaman_fowl_play |
| 妖术 | Hex |  |  | shadow_shaman_voodoo |
| 群蛇守卫 | Mass Serpent Ward |  |  | shadow_shaman_mass_serpent_ward |
| 枷锁 | Shackles |  |  | shadow_shaman_shackles |
| 巨蟒之瓮 | Urnaconda |  |  | shadow_shaman_urnaconda |

### 沉默术士 / Silencer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 奥术诅咒 | Arcane Curse |  |  | silencer_curse_of_the_silent |
| 智慧之刃 | Glaives of Wisdom |  |  | silencer_glaives_of_wisdom |
| 全领域静默 | Global Silence |  | 全球流 / 全图沉默 | silencer_global_silence |
| 遗言 | Last Word |  |  | silencer_last_word |
| 默默受苦 | Suffer In Silence |  |  | silencer_brain_drain |

### 天怒法师 / Skywrath Mage
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 上古封印 | Ancient Seal |  |  | skywrath_mage_ancient_seal |
| 奥法鹰隼 | Arcane Bolt |  |  | skywrath_mage_arcane_bolt |
| 震荡光弹 | Concussive Shot |  |  | skywrath_mage_concussive_shot |
| 神秘之耀 | Mystic Flare |  |  | skywrath_mage_mystic_flare |
| 天裔之盾 | Shield of the Scion |  |  | skywrath_mage_shield_of_the_scion |

### 斯拉达 / Slardar
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 深海重击 | Bash of the Deep |  |  | slardar_bash |
| 侵蚀雾霭 | Corrosive Haze |  |  | slardar_amplify_damage |
| 守卫冲刺 | Guardian Sprint |  |  | slardar_sprint |
| 汪洋前哨 | Seaborn Sentinel |  |  | slardar_seaborn_sentinel |
| 鱼人碎击 | Slithereen Crush |  |  | slardar_slithereen_crush |

### 斯拉克 / Slark
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 黑暗契约 | Dark Pact |  |  | slark_dark_pact |
| 深海护罩 | Depth Shroud |  |  | slark_depth_shroud |
| 能量转移 | Essence Shift |  |  | slark_essence_shift |
| 突袭 | Pounce |  |  | slark_pounce |
| 海浪短刀 | Saltwater Shiv |  |  | slark_saltwater_shiv |
| 暗影之舞 | Shadow Dance |  |  | slark_shadow_dance |

### 电炎绝手 / Snapfire
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 猎枪 | Boomstick |  |  | snapfire_boomstick |
| 龙炎饼干 | Firesnap Cookie |  |  | snapfire_firesnap_cookie |
| 血盆大口 | Gobble Up |  |  | snapfire_gobble_up |
| 霹雳铁手 | Lil' Shredder |  |  | snapfire_lil_shredder |
| 蜥蜴绝吻 | Mortimer Kisses |  |  | snapfire_mortimer_kisses |
| 电光石火 | Scatterblast |  |  | snapfire_scatterblast |
| 喷吐 | Spit Out |  |  | snapfire_spit_creep |

### 狙击手 / Sniper
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 暗杀 | Assassinate |  |  | sniper_assassinate |
| 震荡手雷 | Concussive Grenade |  |  | sniper_concussive_grenade |
| 爆头 | Headshot |  |  | sniper_headshot |
| 基恩瞄准镜 | Keen Scope |  |  | sniper_keen_scope |
| 榴霰弹 | Shrapnel |  |  | sniper_shrapnel |
| 瞄准 | Take Aim |  |  | sniper_take_aim |

### 幽鬼 / Spectre
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 荒芜 | Desolate |  |  | spectre_desolate |
| 折射 | Dispersion |  |  | spectre_dispersion |
| 鬼影重重 | Haunt |  |  | spectre_haunt |
| 如影随形 | Shadow Step |  |  | spectre_shadow_step |
| 幽鬼之刃 | Spectral Dagger |  |  | spectre_spectral_dagger |

### 裂魂人 / Spirit Breaker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 威吓 | Bulldoze |  |  | spirit_breaker_bulldoze |
| 暗影冲刺 | Charge of Darkness |  |  | spirit_breaker_charge_of_darkness |
| 神行太保 | Empowering Haste |  |  | spirit_breaker_bull_rush |
| 巨力重击 | Greater Bash |  |  | spirit_breaker_greater_bash |
| 幽冥一击 | Nether Strike |  |  | spirit_breaker_nether_strike |
| 位面空洞 | Planar Pocket |  |  | spirit_breaker_planar_pocket |

### 风暴之灵 / Storm Spirit
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 球状闪电 | Ball Lightning |  |  | storm_spirit_ball_lightning |
| 电子涡流 | Electric Vortex |  |  | storm_spirit_electric_vortex |
| 通电 | Galvanized |  |  | storm_spirit_galvanized |
| 超负荷 | Overload |  |  | storm_spirit_overload |
| 残影 | Static Remnant |  |  | storm_spirit_static_remnant |

### 斯温 / Sven
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 神之力量 | God's Strength |  |  | sven_gods_strength |
| 巨力挥舞 | Great Cleave |  |  | sven_great_cleave |
| 风暴之拳 | Storm Hammer |  |  | sven_storm_bolt |
| 战吼 | Warcry |  |  | sven_warcry |
| 神之愤怒 | Wrath of God |  |  | sven_wrath_of_god |

### 工程师 / Techies
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 爆破起飞！ | Blast Off! |  |  | techies_suicide |
| 同归于尽 | M.A.D. |  |  | techies_mutually_assured_destruction |
| 雷区标识 | Minefield Sign |  |  | techies_minefield_sign |
| 感应地雷 | Proximity Mines |  |  | techies_land_mines |
| 活性电击 | Reactive Tazer |  |  | techies_reactive_tazer |
| 粘性炸弹 | Sticky Bomb |  |  | techies_sticky_bomb |

### 圣堂刺客 / Templar Assassin
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 心怀安宁 | Inner Peace |  |  | templar_assassin_inner_peace |
| 隐匿 | Meld |  |  | templar_assassin_meld |
| 灵能之刃 | Psi Blades |  |  | templar_assassin_psi_blades |
| 灵能投射 | Psionic Projection |  |  | templar_assassin_trap_teleport |
| 灵能陷阱 | Psionic Trap |  |  | templar_assassin_psionic_trap |
| 折光 | Refraction |  |  | templar_assassin_refraction |

### 恐怖利刃 / Terrorblade
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 惑幻 | Conjure Image |  |  | terrorblade_conjure_image |
| 暗黑团结 | Dark Unity |  |  | terrorblade_dark_unity |
| 狂魔 | Demon Zeal |  |  | terrorblade_demon_zeal |
| 魔化 | Metamorphosis |  |  | terrorblade_metamorphosis |
| 倒影 | Reflection |  |  | terrorblade_reflection |
| 魂断 | Sunder |  |  | terrorblade_sunder |
| 怵潮 | Terror Wave |  |  | terrorblade_terror_wave |

### 潮汐猎人 / Tidehunter
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 锚击 | Anchor Smash |  |  | tidehunter_anchor_smash |
| 重如铁锚 | Dead in the Water |  |  | tidehunter_dead_in_the_water |
| 巨浪 | Gush |  |  | tidehunter_gush |
| 海妖外壳 | Kraken Shell |  |  | tidehunter_kraken_shell |
| 利维坦的渔获 | Leviathan's Catch |  |  | tidehunter_leviathans_catch |
| 毁灭 | Ravage |  | 大海啸 | tidehunter_ravage |

### 伐木机 / Timbersaw
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 锯齿飞轮 | Chakram |  |  | shredder_chakram |
| 暴露疗法 | Exposure Therapy |  |  | shredder_exposure_therapy |
| 喷火装置 | Flamethrower |  |  | shredder_flamethrower |
| 活性护甲 | Reactive Armor |  |  | shredder_reactive_armor |
| 伐木锯链 | Timber Chain |  |  | shredder_timber_chain |
| 死亡旋风 | Whirling Death |  |  | shredder_whirling_death |

### 修补匠 / Tinker
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 部署炮塔 | Deploy Turrets |  |  | tinker_deploy_turrets |
| 尤里卡！ | Eureka! |  |  | tinker_eureka |
| 激光 | Laser |  |  | tinker_laser |
| 机械行军 | March of the Machines |  |  | tinker_march_of_the_machines |
| 再装填 | Rearm |  |  | tinker_rearm |
| 折跃耀光 | Warp Flare |  |  | tinker_warp_grenade |

### 小小 / Tiny
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 山崩 | Avalanche |  |  | tiny_avalanche |
| 长大 | Grow |  |  | tiny_grow |
| 不可逾越 | Insurmountable |  |  | tiny_insurmountable |
| 投掷 | Toss |  |  | tiny_toss |
| 抓树 | Tree Grab |  |  | tiny_tree_grab |
| 扔树 | Tree Throw |  |  | tiny_toss_tree |
| 树木连掷 | Tree Volley |  |  | tiny_tree_channel |

### 树精卫士 / Treant Protector
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 丛林之眼 | Eyes In The Forest |  |  | treant_eyes_in_the_forest |
| 寄生种子 | Leech Seed |  |  | treant_leech_seed |
| 活体护甲 | Living Armor |  |  | treant_living_armor |
| 自然卷握 | Nature's Grasp |  |  | treant_natures_grasp |
| 自然蔽护 | Nature's Guise |  |  | treant_natures_guise |
| 疯狂生长 | Overgrowth |  |  | treant_overgrowth |

### 巨魔战将 / Troll Warlord
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 战斗姿态 | Battle Stance |  |  | troll_warlord_switch_stance |
| 战斗专注 | Battle Trance |  |  | troll_warlord_battle_trance |
| 狂战士之怒 | Berserker's Rage |  |  | troll_warlord_berserkers_rage |
| 热血战魂 | Fervor |  |  | troll_warlord_fervor |
| 旋风飞斧（近战） | Whirling Axes (Melee) |  |  | troll_warlord_whirling_axes_melee |
| 旋风飞斧（远程） | Whirling Axes (Ranged) |  |  | troll_warlord_whirling_axes_ranged |

### 巨牙海民 / Tusk
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 严寒 | Bitter Chill |  |  | tusk_bitter_chill |
| 酒友 | Drinking Buddies |  |  | tusk_drinking_buddies |
| 寒冰碎片 | Ice Shards |  |  | tusk_ice_shards |
| 雪球 | Snowball |  |  | tusk_snowball |
| 摔角行家 | Tag Team |  |  | tusk_tag_team |
| 海象飞踢 | Walrus Kick |  |  | tusk_walrus_kick |
| 海象神拳！ | Walrus PUNCH! |  |  | tusk_walrus_punch |

### 孽主 / Underlord
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 衰退光环 | Atrophy Aura |  |  | abyssal_underlord_atrophy_aura |
| 恶魔之扉 | Fiend's Gate |  |  | abyssal_underlord_dark_portal |
| 火焰风暴 | Firestorm |  |  | abyssal_underlord_firestorm |
| 侵略大军 | Invading Force |  |  | abyssal_underlord_raid_boss |
| 怨念深渊 | Pit of Malice |  |  | abyssal_underlord_pit_of_malice |

### 不朽尸王 / Undying
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 挽歌犹唱 | Ceaseless Dirge |  |  | undying_ceaseless_dirge |
| 腐朽 | Decay |  |  | undying_decay |
| 血肉傀儡 | Flesh Golem |  |  | undying_flesh_golem |
| 噬魂 | Soul Rip |  |  | undying_soul_rip |
| 墓碑 | Tombstone |  |  | undying_tombstone |

### 熊战士 / Ursa
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 震撼大地 | Earthshock |  |  | ursa_earthshock |
| 激怒 | Enrage |  |  | ursa_enrage |
| 怒意狂击 | Fury Swipes |  |  | ursa_fury_swipes |
| 暴烈之爪 | Maul |  |  | ursa_maul |
| 超强力量 | Overpower |  |  | ursa_overpower |

### 复仇之魂 / Vengeful Spirit
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 魔法箭 | Magic Missile |  |  | vengefulspirit_magic_missile |
| 移形换位 | Nether Swap |  |  | vengefulspirit_nether_swap |
| 恶有恶报 | Retribution |  |  | vengefulspirit_retribution |
| 复仇光环 | Vengeance Aura |  |  | vengefulspirit_command_aura |
| 恐怖波动 | Wave of Terror |  |  | vengefulspirit_wave_of_terror |

### 剧毒术士 / Venomancer
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 恶性瘟疫 | Noxious Plague |  |  | venomancer_noxious_plague |
| 瘟疫守卫 | Plague Ward |  |  | venomancer_plague_ward |
| 毒刺 | Poison Sting |  |  | venomancer_poison_sting |
| 毒蛇撕咬 | Snakebite |  |  | venomancer_snakebite |
| 瘴气 | Venomous Gale |  |  | venomancer_venomous_gale |

### 冥界亚龙 / Viper
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 腐蚀皮肤 | Corrosive Skin |  |  | viper_corrosive_skin |
| 幽冥剧毒 | Nethertoxin |  |  | viper_nethertoxin |
| 极恶俯冲 | Nosedive |  |  | viper_nose_dive |
| 毒性攻击 | Poison Attack |  |  | viper_poison_attack |
| 掠食 | Predator |  |  | viper_predator |
| 蝮蛇突袭 | Viper Strike |  |  | viper_viper_strike |

### 维萨吉 / Visage
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 黄泉颤抖 | Grave Chill |  |  | visage_grave_chill |
| 陵卫斗篷 | Gravekeeper's Cloak |  |  | visage_gravekeepers_cloak |
| 静如古墓 | Silent as the Grave |  |  | visage_silent_as_the_grave |
| 灵魂超度 | Soul Assumption |  |  | visage_soul_assumption |
| 召唤佣兽 | Summon Familiars |  |  | visage_summon_familiars |

### 虚无之灵 / Void Spirit
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 残阴 | Aether Remnant |  |  | void_spirit_aether_remnant |
| 太虚之径 | Astral Step |  |  | void_spirit_astral_step |
| 异化 | Dissimilate |  |  | void_spirit_dissimilate |
| 内在优势 | Intrinsic Edge |  |  | void_spirit_intrinsic_edge |
| 共鸣脉冲 | Resonant Pulse |  |  | void_spirit_resonant_pulse |

### 术士 / Warlock
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 混乱之祭 | Chaotic Offering |  |  | warlock_rain_of_chaos |
| 邪术召唤 | Eldritch Summoning |  |  | warlock_eldritch_summoning |
| 致命连接 | Fatal Bonds |  |  | warlock_fatal_bonds |
| 暗言术 | Shadow Word |  |  | warlock_shadow_word |
| 剧变 | Upheaval |  |  | warlock_upheaval |

### 编织者 / Weaver
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 连击 | Geminate Attack |  |  | weaver_geminate_attack |
| 缩地 | Shukuchi |  |  | weaver_shukuchi |
| 虫群 | The Swarm |  |  | weaver_the_swarm |
| 命运之线 | Threads of Fate |  |  | weaver_threads_of_fate |
| 时光倒流 | Time Lapse |  |  | weaver_time_lapse |

### 风行者 / Windranger
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 集中火力 | Focus Fire |  |  | windrunner_focusfire |
| 狂风之力 | Gale Force |  |  | windrunner_gale_force |
| 强力击 | Powershot |  |  | windrunner_powershot |
| 束缚击 | Shackleshot | Shackle | 束缚击 | windrunner_shackleshot |
| 一路顺风 | Tailwind |  |  | windrunner_tailwind |
| 风行 | Windrun |  |  | windrunner_windrun |

### 寒冬飞龙 / Winter Wyvern
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 严寒烧灼 | Arctic Burn |  |  | winter_wyvern_arctic_burn |
| 极寒之拥 | Cold Embrace |  |  | winter_wyvern_cold_embrace |
| 古龙诗集 | Eldwurm's Edda |  |  | winter_wyvern_eldwurms_edda |
| 碎裂冲击 | Splinter Blast |  |  | winter_wyvern_splinter_blast |
| 寒冬诅咒 | Winter's Curse |  |  | winter_wyvern_winters_curse |

### 巫医 / Witch Doctor
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 死亡守卫 | Death Ward |  |  | witch_doctor_death_ward |
| 驱邪护符 | Gris-Gris |  |  | witch_doctor_gris_gris |
| 巫蛊咒术 | Maledict |  |  | witch_doctor_maledict |
| 麻痹药剂 | Paralyzing Cask |  |  | witch_doctor_paralyzing_cask |
| 巫毒疗法 | Voodoo Restoration |  |  | witch_doctor_voodoo_restoration |
| 巫毒变身术 | Voodoo Switcheroo |  |  | witch_doctor_voodoo_switcheroo |

### 冥魂大帝 / Wraith King
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 白骨护卫 | Bone Guard |  |  | skeleton_king_bone_guard |
| 本命一击 | Mortal Strike |  |  | skeleton_king_mortal_strike |
| 绝冥再生 | Reincarnation |  |  | skeleton_king_reincarnation |
| 吸血灵魂 | Vampiric Spirit |  |  | skeleton_king_vampiric_spirit |
| 冥火爆击 | Wraithfire Blast |  |  | skeleton_king_hellfire_blast |

### 宙斯 / Zeus
| 中文正式名 | 英文正式名 | 英文别名/缩写 | 中文别名 | 内部名 |
| --- | --- | --- | --- | --- |
| 弧形闪电 | Arc Lightning |  |  | zuus_arc_lightning |
| 神圣一跳 | Heavenly Jump |  |  | zuus_heavenly_jump |
| 雷击 | Lightning Bolt |  |  | zuus_lightning_bolt |
| 霹雳之手 | Lightning Hands |  |  | zuus_lightning_hands |
| 雷云 | Nimbus |  |  | zuus_cloud |
| 静电场 | Static Field |  |  | zuus_static_field |
| 雷神之怒 | Thundergod's Wrath |  |  | zuus_thundergods_wrath |
