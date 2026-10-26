(function(){'use strict';const F=window.EDALessons;if(!F)return;
const booleanExtra=`<h2>7.1 · 用数组索引实现 Cofactor，逐项检查</h2><p>把三变量真值表按二进制顺序排列，索引写成 i=4x+2y+z。此处 x 是最高位，不是默认所有软件都采用这种顺序。按 x 固定为0或1时，四个剩余输入 (y,z) 依次为00、01、10、11；要从原表读取的索引分别为0…3或4…7。</p><pre>def cofactor_x(table, x):
    assert len(table) == 8 and x in (0, 1)
    result = []
    for y in (0, 1):
        for z in (0, 1):
            source_index = 4*x + 2*y + z
            result.append(table[source_index])
    return result</pre><p>正确性不变量是：已写入的第 j 项正好等于固定 x 后、第 j 个 (y,z) 组合的原函数输出。循环枚举四种组合，无重无漏，结束时就是完整 cofactor。若改为按 y 固定，源索引必须改成 4x+2·固定值+z，不能把原表机械切成两半。</p><p>例如 H=(x XOR y) AND z。固定 x=0，XOR变成y，故 H₀=yz；固定 x=1，XOR变成¬y，故 H₁=¬y·z。其两个四项向量为0001和0100；Shannon输出是 ¬x·yz+x·¬y·z。再取任意测试输入 x=1,y=0,z=1，原式(1 XOR 0)AND1=1，展开式只有正分支1·1·1=1。单个输入检查能排错，但不能替代前面全输入的恒等证明。</p><h2>7.2 · 为什么不能机械地按门数评判展开？</h2><p>一个布尔函数可以有多个等价表达式。先证明功能相等，才讨论实现。面积可能受库门是否含MUX、AOI等复合门、子函数是否共享影响；延迟还与输入到达时间、引脚延迟、负载及互连相关。逻辑深度少不必然有更短的物理关键路径。</p><p>若一个输入晚到，选它为MUX select还是数据端可能产生不同延迟。此时必须把库的pin-to-pin时序加入模型，而不是凭Shannon恒等式宣称某个变量顺序永远最优。下一阶段的technology mapping正是把功能表示与实现成本连接起来。</p>`;
F.T03.html=F.T03.html.replace('<h2>8. 与考试和后续单元连接</h2>',booleanExtra+'<h2>8. 与考试和后续单元连接</h2>');
const gemmExtra=`<h2>7.1 · 用循环不变量证明尾块不是“碰巧算对”</h2><p>令当前tile起点为start。进入这一轮前，每个有效输出线程的acc应等于所有 k&lt;start 的乘积之和。协同装载后，对本轮每个 offset，若 start+offset&lt;K，shared中分别保存正确的A与B元素；否则至少对应的越界项被置0。第一barrier保证这些值已全部发布。</p><p>完成T次offset累加后，acc增加本轮合法K范围的全部乘积，越界槽只贡献0。因此进入下一轮时，不变量仍成立。第二barrier保护本轮读取结束；最后start跨过K，acc包含k=0…K−1每项且只一次。最终写回仅对合法r,c执行，因此不会把参与协作的越界线程误写入输出。</p><p>这一证明同时解释四类常见错误：每轮把acc清零会丢前缀；漏补0会把上轮shared残留当成本轮数据；漏第一barrier会读未完成装载；漏第二barrier会读已被下一轮覆盖的数据。它们都不是调大数值容差能够正确修复的问题。</p>`;
F.L06.html=F.L06.html.replace('<h2>8. 同 bank 不一定就是冲突</h2>',gemmExtra+'<h2>8. 同 bank 不一定就是冲突</h2>');
})();
