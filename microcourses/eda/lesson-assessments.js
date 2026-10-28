/* One consistent assessment engine for all 85 four-level checks. */
(function(){'use strict';
for(const [id,l] of Object.entries(window.EDALessons)){
 const u=window.EDACourse.units.find(x=>x.id===id),s=u.sources[0];
 if(window.EDAExamples.some(e=>e.id==='CHECK-'+id))throw Error('Duplicate lesson assessment '+id);
 window.EDAExamples.push({id:'CHECK-'+id,unit:id,origin:'extension',category:'lesson-check',deck:s.path,pages:s.pages||s.section||'对应知识点',title:id+' · 四级学习验收',stem:'本讲独立编写的四级自测：15 / 20 / 25 / 40 分。客观判分与开放题人工分项评阅分开；只有完成评阅后才显示明确标注的合计。',questions:l.quiz.questions,solution:'请将每题解析与本讲的假设、推导、反例及来源对应；读完或取得自评分数不等于课程实验通过。',source_note:'新增教学测验，不冒充原课件或原卷原题。知识依据见本讲各来源；没有使用任意文本关键词假判证明。'});
}
})();
