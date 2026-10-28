(function(){'use strict';const{add,num:N,vec:V,multi:M,open:O}=window.EDAExampleTools;
add('EX-G07-TIMELINE','G07','G02',[45,47,50],'新增：重叠时间线与完成关键路径','构造同一设备上允许并行的两个独立kernel：A在[0,4]ms，B在[2,6]ms；CPU在[0,6]ms等待这两项完成。后续依赖两者的C在[6,7]ms执行。所有数字为新增教学变式，不冒称原profiler截图。',[
V('填写A+B的时长和、A/B忙区间并集、含C的完成时间。',['时长和/ms','忙区间/ms','完成/ms'],[8,6,7],35,'并行区间不可重复计费。','4+4=8；并集[0,6]为6；C结束为7。'),
N('若只把A改成[0,1]ms，其余起止依赖条件不变，任务完成时间是多少ms？',7,25,'B仍在6ms完成，C不能早于B。','仍为7ms。'),
O('说明CPU等待区间为何不应再加到GPU时长和上，并给一组足以复现本trace的记录字段。',40,'同一墙钟时间可同时出现在多个轨道。',['等待与设备执行重叠（15）','任务DAG与stream/依赖关系（10）','API和设备起止、输入shape/dtype、代码与设备版本（15）'],'CPU等待[0,6]覆盖GPU活动，重复相加会构造不存在的时间。记录请求/阶段ID、CPU提交和完成事件、设备kernel起止、stream、依赖、输入shape/dtype、launch与版本；用区间并集和关键路径核对。')],
'这组新增题检验不能从最长kernel或时长和直接推出E2E优化收益。数值完全确定，开放项只接受人工/自评。','extension');
const e=window.EDAExamples.find(e=>e.id==='R059B'),q=e?.questions.find(q=>q.type==='multiroute');
if(q){function joinSegments(points){const out=[points[0].slice()];for(let i=1;i<points.length;i++){let [r,c]=out.at(-1);const [rr,cc]=points[i];if(r!==rr&&c!==cc)throw Error('Witness must use rectilinear segments');while(r!==rr||c!==cc){r+=Math.sign(rr-r);c+=Math.sign(cc-c);out.push([r,c]);}}return out;}q.reference_routes={a:joinSegments([[0,7],[0,8],[6,8],[6,0],[2,0],[2,3]]),b:joinSegments([[2,7],[2,4],[5,4],[5,7]])};}
})();
