import json
bx=json.load(open('/home/claude/view/ui_boxes.json'))
idx={'home':0,'play':1,'map':2,'chars':3,'settings':4,'guide':5,'achv':6,'shop':7,'sound':8,'help':10,'endturn':11,'roll':12,'manage':13,'stockmkt':14,'bank':15,'eventcard':16,'casino':17,
'buy':18,'upgrade':19,'invest':20,'sell':21,'exchange':22,'auction':23,'build':24,'demolish':25,'b_normal':26,'b_pressed':27,'b_disabled':36,'deposit':28,'withdraw':29,'buystock':30,'sellstock':31,'view':32,'detail':33,'ok':34,'cancel':35,
'status':37,'assets':38,'viewmap':39,'players':40,'districts':41,'rank':42,'snap':44,'skip':45,'auto':46,'prev':48,'next':49,'close':53,
'i_money':54,'i_stock':55,'i_shop':68,'i_district':56,'i_card':57,'i_item':58,'i_bonus':72,'i_tax':73,'i_toll':74,'i_warp':59,'i_rest':60,'i_lucky':61,'i_super':78,'i_event':62,
'd1':63,'d2':64,'d3':65,'d4':80,'d5':81,'d6':82,'rank1':83,'rank2':84,'rank3':85,'rank4':86,'plus':87,'minus':88,'yourturn':89,'walking':90,'thinking':91,'roundpill':92,'typing':93,
'c_check':94,'c_x':95,'c_warn':96,'c_info':97,'c_q':98,'c_star':99,'c_heart':100,'c_clover':101}
named={k:bx[v] for k,v in idx.items()}
named.update({'music':[1300,28,72,72],'full':[1375,28,72,72],'save':[818,550,120,105],'load':[942,550,118,105],
 'tab_all':[15,678,160,65],'tab_shop':[178,678,148,65],'tab_stock':[328,678,145,65],'tab_card':[475,678,148,65],'tab_bld':[625,678,160,65],'tab_item':[787,678,145,65],'tab_other':[934,678,132,65]})
json.dump(named,open('/home/claude/view/ui_named.json','w'))
