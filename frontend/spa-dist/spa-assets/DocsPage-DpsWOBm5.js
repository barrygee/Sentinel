const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["spa-assets/mermaid.core-Kz0Iw3L6.js","spa-assets/vite-preload-helper-zJ_50EbN.js","spa-assets/chunk-PWAF6VOD-OPovV9E-.js","spa-assets/src-C44w8LJe.js","spa-assets/rolldown-runtime-QTnfLwEv.js","spa-assets/chunk-Y2CYZVJY-DsF7k-Jl.js","spa-assets/chunk-DU6HZSFF-o_UkBJwL.js","spa-assets/purify.es-F_7NWVtX.js","spa-assets/chunk-75Z2AOVW-C0FVKb5g.js","spa-assets/dist-D9sYb5Oa.js","spa-assets/chunk-GMAD6QVW-C16H8jf_.js","spa-assets/chunk-2E4U76K2-VJzWexOh.js","spa-assets/graphlib-B8gBHxth.js","spa-assets/chunk-4HAMMTFA-DTnfzTj1.js","spa-assets/chunk-P2QGCYS3-B9xFPCnT.js","spa-assets/rough.esm-CSKSodPl.js","spa-assets/chunk-GVQU2GXP-CK9tPnId.js","spa-assets/chunk-L3NEJ4N5-g7ENezSA.js","spa-assets/chunk-OSK3NFVY-9QNFCMm4.js","spa-assets/line-CkrT1ceS.js","spa-assets/path-BWPyau1x.js","spa-assets/array-BifhSqXX.js","spa-assets/chunk-CLGD4ZFX-Ca3GLlYJ.js","spa-assets/chunk-LNGE3PJU-OosUmKKA.js","spa-assets/chunk-TLUHSLCS-BBJx4KVo.js"])))=>i.map(i=>d[i]);
import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import{$ as t,A as n,C as r,F as i,G as a,H as o,J as s,K as c,Q as l,R as u,S as d,V as f,W as p,Z as m,_ as h,c as g,f as _,g as v,m as y,o as b,q as x,u as S,v as C,w,x as T,y as ee,z as E}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__pinia__loadShare__.js-CWWFmord.js";import{n as D,t as te}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__vue_mf_2_router__loadShare__.js-CiqbY0-n.js";import{Tt as ne,_ as O,ft as re,n as ie,q as ae,v as oe}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__shared-6UGU0oIo.js";import{t as se}from"./vite-preload-helper-zJ_50EbN.js";import{t as k}from"./_plugin-vue_export-helper-BDNMzG2s.js";import{a as ce,c as A,i as le,n as ue,o as de,r as fe,s as pe,t as me}from"./index-CDCi8fUZ.js";import{t as he}from"./purify.es-F_7NWVtX.js";var ge={class:`doc-callout__label`},_e={key:0,class:`doc-callout__glyph`,width:`14`,height:`14`,viewBox:`0 0 14 14`,fill:`none`,"aria-hidden":`true`},ve={key:1,class:`doc-callout__dot`,"aria-hidden":`true`},ye={class:`doc-callout__body`},be=k(t({__name:`DocsCallout`,props:{variant:{}},setup(e){let t=e,n=p(()=>t.variant.toUpperCase()),r=p(()=>t.variant===`warning`||t.variant===`caution`);return(t,i)=>(y(),x(`aside`,{class:E([`doc-callout`,`doc-callout--${e.variant}`]),role:`note`},[s(`p`,ge,[r.value?(y(),x(`svg`,_e,[...i[0]||=[s(`circle`,{cx:`7`,cy:`7`,r:`6.2`,stroke:`currentColor`,"stroke-width":`1.4`},null,-1),s(`line`,{x1:`7`,y1:`3.8`,x2:`7`,y2:`7.6`,stroke:`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`},null,-1),s(`circle`,{cx:`7`,cy:`10`,r:`0.9`,fill:`currentColor`},null,-1)]])):(y(),x(`span`,ve)),m(` `+f(n.value),1)]),s(`div`,ye,[h(t.$slots,`default`,{},void 0,!0)])],2))}}),[[`__scopeId`,`data-v-49f9be92`]]);async function xe(e){if(navigator.clipboard?.writeText)try{return await navigator.clipboard.writeText(e),!0}catch{}let t=document.activeElement,n=document.createElement(`textarea`);n.value=e,n.setAttribute(`readonly`,``),n.style.position=`fixed`,n.style.opacity=`0`,document.body.appendChild(n),n.select();try{return document.execCommand(`copy`)}catch{return!1}finally{n.remove(),t instanceof HTMLElement&&t.focus()}}var Se={class:`doc-code`},Ce={class:`doc-code__bar`},we={class:`doc-code__language`},Te=[`aria-label`],Ee=2e3,De=k(t({__name:`DocsCodeBlock`,props:{code:{},language:{}},setup(e){let t=e,n=A(),r=i(null),a=i(`idle`),o;function c(){let e=r.value,t=window.getSelection();if(!e||!t)return;let n=document.createRange();n.selectNodeContents(e),t.removeAllRanges(),t.addRange(n)}async function u(){await xe(t.code)?(a.value=`copied`,n.announce(`Copied to clipboard`)):(c(),a.value=`select`,n.announce(`Code selected. Press Control or Command and C to copy.`)),clearTimeout(o),o=setTimeout(()=>{a.value=`idle`},Ee)}S(()=>clearTimeout(o));let d={idle:`COPY`,copied:`COPIED`,select:`SELECT AND COPY`};return(t,n)=>(y(),x(`figure`,Se,[s(`div`,Ce,[s(`span`,we,f(e.language||`code`),1),l(ae,{class:`doc-code__copy`,variant:`ghost`,onClick:u},{default:w(()=>[m(f(d[a.value]),1)]),_:1})]),s(`pre`,{ref_key:`preRef`,ref:r,tabindex:`0`,role:`group`,"aria-label":`${e.language||`Code`} code`},[s(`code`,null,f(e.code),1)],8,Te)]))}}),[[`__scopeId`,`data-v-8de99b15`]]),j=`#15171d`,Oe={background:j,primaryColor:`#26292e`,primaryBorderColor:`#26292e`,primaryTextColor:`#ffffff`,textColor:`#ffffff`,titleColor:`#ffffff`,lineColor:`#9a9ca1`,secondaryColor:`#13171f`,tertiaryColor:`#1c1f26`,clusterBkg:`#1c1f26`,clusterBorder:`#1c1f26`,actorBkg:`#26292e`,actorBorder:`#26292e`,actorTextColor:`#ffffff`,actorLineColor:`#5c5f66`,signalColor:`#9a9ca1`,signalTextColor:`#ffffff`,noteBkgColor:`#1c1f26`,noteBorderColor:`#1c1f26`,noteTextColor:`#ffffff`,labelBoxBkgColor:`#26292e`,labelBoxBorderColor:`#26292e`,labelTextColor:`#ffffff`,loopTextColor:`#ffffff`,fontFamily:`'Barlow', 'Helvetica Neue', Arial, sans-serif`,fontSize:`14px`,edgeLabelBackground:j},ke={padding:16,nodeSpacing:44,rankSpacing:60,diagramPadding:20,subGraphTitleMargin:{top:14,bottom:12}},Ae={actorMargin:50,boxMargin:14,boxTextMargin:8,noteMargin:14,messageMargin:44},je=`
  .node.accent rect, .node.accent polygon, .node.accent circle, .node.accent ellipse, .node.accent path {
    stroke: #c8ff00 !important;
    stroke-width: 1.5px !important;
    fill: rgba(200, 255, 0, 0.16) !important;
  }
  .node rect, .node polygon, .node circle, .node ellipse, .cluster rect {
    stroke: none !important;
  }
  .cluster.online rect {
    stroke: none !important;
    fill: rgba(255, 255, 255, 0.05) !important;
  }
  .cluster.offgrid rect {
    stroke: #c8ff00 !important;
    stroke-width: 1.5px !important;
    stroke-dasharray: 6 4 !important;
    fill: rgba(200, 255, 0, 0.06) !important;
  }
  .flowchart-link { stroke-width: 1.5px !important; }
  marker path, .arrowheadPath, .arrowMarkerPath {
    fill: #e8eaed !important;
    stroke: #e8eaed !important;
  }
  /* Sequence message text sits across lifelines: a canvas-coloured outline
     drawn behind each letter keeps the lines from running through it. */
  .messageText, .noteText, .loopText {
    paint-order: stroke;
    stroke: ${j};
    stroke-width: 12px;
    stroke-linejoin: round;
  }
  .edgeLabel rect, .edgeLabel .labelBkg {
    fill: ${j} !important;
    stroke: ${j} !important;
    stroke-width: 12px !important;
    opacity: 1 !important;
  }
  .cluster.online .cluster-label text, .cluster.online .cluster-label tspan { fill: #ffffff !important; font-weight: 600; letter-spacing: 0.12em; }
  .cluster.offgrid .cluster-label text, .cluster.offgrid .cluster-label tspan { fill: #c8ff00 !important; font-weight: 600; letter-spacing: 0.12em; }
`,Me=1.6;function Ne(e){e.querySelectorAll(`marker`).forEach(e=>{for(let t of[`markerWidth`,`markerHeight`]){let n=Number(e.getAttribute(t));n>0&&e.setAttribute(t,String(n*Me))}})}function Pe(e){let t=t=>{let n=t.parentElement;for(;n&&n!==e;){if(n.hasAttribute(`transform`))return!1;n=n.parentElement}return!0},n=[...e.querySelectorAll(`.actor-line`)].filter(t);if(n.length===0)return;let r=document.createElementNS(`http://www.w3.org/2000/svg`,`g`);r.setAttribute(`class`,`doc-lifelines`),n.forEach(e=>r.appendChild(e)),e.insertBefore(r,e.firstChild)}var Fe,Ie=0;function Le(){return Fe??=se(async()=>{let{default:e}=await import(`./mermaid.core-Kz0Iw3L6.js`);return{default:e}},__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24])).then(({default:e})=>(e.initialize({startOnLoad:!1,theme:`base`,themeVariables:Oe,themeCSS:je,securityLevel:`strict`,htmlLabels:!1,flowchart:{htmlLabels:!1,useMaxWidth:!0,...ke},sequence:Ae,logLevel:`fatal`}),e)),Fe}async function Re(e,t){let n=await Le();await n.parse(e),Ie+=1;let{svg:r}=await n.render(`doc-diagram-${Ie}`,e),i=document.createElement(`div`);i.innerHTML=he.sanitize(r,{USE_PROFILES:{svg:!0,svgFilters:!0}});let a=i.querySelector(`svg`);if(!a)throw Error(`Mermaid returned no SVG`);return Ne(a),Pe(a),a.setAttribute(`role`,`img`),a.setAttribute(`aria-label`,t),a.removeAttribute(`aria-roledescription`),a.removeAttribute(`aria-labelledby`),a.removeAttribute(`aria-describedby`),a.querySelectorAll(`:scope > title, :scope > desc`).forEach(e=>e.remove()),a}var ze={class:`doc-diagram-block`},Be={class:`doc-diagram`},Ve={key:0,class:`doc-diagram__loading`,"aria-busy":`true`},He={key:1,class:`doc-diagram__scroll theme-dark`,role:`region`,tabindex:`0`,"aria-label":`Diagram`},Ue={key:3,class:`doc-diagram__caption`},We=[`innerHTML`],Ge=k(t({__name:`DocsDiagram`,props:{source:{},caption:{},textHtml:{}},setup(e){let t=e,n=i(`loading`),r=i(null);return _(async()=>{try{let e=await Re(t.source,t.caption||`Diagram`);n.value=`ready`,await g(),r.value?.replaceChildren(e)}catch{n.value=`failed`}}),(t,i)=>(y(),x(`div`,ze,[s(`figure`,Be,[n.value===`loading`?(y(),x(`div`,Ve,` LOADING DIAGRAM `)):n.value===`ready`?(y(),x(`div`,He,[s(`div`,{ref_key:`canvasRef`,ref:r,class:`doc-diagram__canvas`},null,512)])):(y(),x(o,{key:2},[l(be,{variant:`warning`},{default:w(()=>[...i[0]||=[s(`p`,null,`This diagram couldn't be drawn; its text version follows.`,-1)]]),_:1}),l(De,{language:`mermaid`,code:e.source},null,8,[`code`])],64)),e.caption?(y(),x(`figcaption`,Ue,f(e.caption),1)):c(``,!0)]),e.textHtml?(y(),x(`div`,{key:0,class:`doc-diagram-text`,innerHTML:e.textHtml},null,8,We)):c(``,!0)]))}}),[[`__scopeId`,`data-v-7006800e`]]),Ke=[`href`,`aria-label`],qe=k(t({__name:`DocsHeadingAnchor`,props:{headingId:{},headingText:{}},setup(e){let t=e,n=te(),r=D(),i=A();async function a(e){e.preventDefault();let a={path:n.path,query:n.query,hash:`#${t.headingId}`},o=r.resolve(a);r.replace(a),await xe(new URL(o.href,window.location.origin).href)&&i.announce(`Link to section copied`)}return(t,n)=>(y(),x(`a`,{class:`doc-anchor`,href:`#${e.headingId}`,"aria-label":`Link to section: ${e.headingText}`,onClick:a},[...n[0]||=[s(`svg`,{width:`14`,height:`14`,viewBox:`0 0 14 14`,fill:`none`,"aria-hidden":`true`},[s(`path`,{d:`M6 8a2.4 2.4 0 0 0 3.4 0l2-2A2.4 2.4 0 0 0 8 2.6L7.2 3.4M8 6a2.4 2.4 0 0 0-3.4 0l-2 2A2.4 2.4 0 0 0 6 11.4l.8-.8`,stroke:`currentColor`,"stroke-width":`1.4`,"stroke-linecap":`round`,"stroke-linejoin":`round`})],-1)]],8,Ke))}}),[[`__scopeId`,`data-v-08ec1cc7`]]),Je=[`innerHTML`],Ye=k(t({__name:`DocsSectionHeading`,props:{level:{},id:{},html:{},text:{}},setup(e){let t=e,n=p(()=>`h${t.level}`),r=p(()=>t.level<=4);return(t,i)=>(y(),a(ee(n.value),{id:e.id,class:E([`doc-section-heading`,`doc-section-heading--h${e.level}`]),tabindex:`-1`},{default:w(()=>[s(`span`,{innerHTML:e.html},null,8,Je),r.value?(y(),a(qe,{key:0,"heading-id":e.id,"heading-text":e.text},null,8,[`heading-id`,`heading-text`])):c(``,!0)]),_:1},8,[`id`,`class`]))}}),[[`__scopeId`,`data-v-27011201`]]),Xe=[`aria-label`],Ze=[`innerHTML`],Qe=k(t({__name:`DocsTableScroll`,props:{html:{},label:{}},setup(e){let t=i(null),n=i(!1),r=null;function a(){let e=t.value;e&&(n.value=e.scrollLeft+e.clientWidth<e.scrollWidth-1)}return _(()=>{if(a(),typeof ResizeObserver>`u`||!t.value)return;r=new ResizeObserver(a),r.observe(t.value);let e=t.value.querySelector(`table`);e&&r.observe(e)}),S(()=>r?.disconnect()),(r,i)=>(y(),x(`div`,{ref_key:`regionRef`,ref:t,class:E([`doc-table-scroll`,{"doc-table-scroll--more":n.value}]),role:`region`,tabindex:`0`,"aria-label":e.label,onScrollPassive:a},[s(`div`,{innerHTML:e.html},null,8,Ze)],42,Xe))}}),[[`__scopeId`,`data-v-c0b9c17b`]]),$e=[`innerHTML`],et=[`innerHTML`],tt=k(t({__name:`DocsArticle`,props:{blocks:{}},setup(e){let t=D();function n(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;let n=(e.target?.closest(`a[data-doc-link]`))?.getAttribute(`href`);n&&(e.preventDefault(),t.push(n))}return(t,r)=>(y(),x(`article`,{class:`doc-article`,onClick:n},[(y(!0),x(o,null,v(e.blocks,(e,t)=>(y(),x(o,{key:t},[e.kind===`html`?(y(),x(`div`,{key:0,class:`doc-prose`,innerHTML:e.html},null,8,$e)):e.kind===`heading`?(y(),a(Ye,{key:1,id:e.id,level:e.level,html:e.html,text:e.text},null,8,[`id`,`level`,`html`,`text`])):e.kind===`code`?(y(),a(De,{key:2,code:e.code,language:e.language},null,8,[`code`,`language`])):e.kind===`table`?(y(),a(Qe,{key:3,html:e.html,label:e.label},null,8,[`html`,`label`])):e.kind===`callout`?(y(),a(be,{key:4,variant:e.variant},{default:w(()=>[s(`div`,{innerHTML:e.html},null,8,et)]),_:2},1032,[`variant`])):(y(),a(Ge,{key:5,source:e.source,caption:e.caption,"text-html":e.textHtml},null,8,[`source`,`caption`,`text-html`]))],64))),128))]))}}),[[`__scopeId`,`data-v-4eaa1044`]]),nt={class:`doc-breadcrumb`,"aria-label":`Breadcrumb`},rt={key:1,"aria-current":`page`},it=k(t({__name:`DocsBreadcrumb`,props:{trail:{}},setup(e){return(t,n)=>{let r=C(`RouterLink`);return y(),x(`nav`,nt,[s(`ol`,null,[(y(!0),x(o,null,v(e.trail,(t,n)=>(y(),x(`li`,{key:t.label},[t.to&&n<e.trail.length-1?(y(),a(r,{key:0,to:t.to,"aria-current":void 0},{default:w(()=>[m(f(t.label),1)]),_:2},1032,[`to`])):(y(),x(`span`,rt,f(t.label),1))]))),128))])])}}}),[[`__scopeId`,`data-v-67d8b810`]]);function at(){let e=D();function t(){let e=ue.opener;if(e?.isConnected&&e.getClientRects().length>0){e.focus();return}document.getElementById(`main`)?.focus()}let n=!1;function r(){if(n)return;n=!0;let r=ue.path??`/`,i=e.afterEach(()=>{i(),n=!1,setTimeout(t,0)});window.history.state?.back===r?e.back():e.replace(r)}return{closeDocs:r}}var ot=k(t({__name:`DocsCloseButton`,setup(e){let{closeDocs:t}=at();return(e,n)=>(y(),a(ne,{class:`doc-close`,"accessible-name":`Close docs`,tooltip:`CLOSE`,"tooltip-side":`left`,onClick:u(t)},{default:w(()=>[...n[0]||=[s(`svg`,{width:`18`,height:`18`,viewBox:`0 0 18 18`,fill:`none`,"aria-hidden":`true`},[s(`line`,{x1:`3`,y1:`3`,x2:`15`,y2:`15`,stroke:`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`}),s(`line`,{x1:`15`,y1:`3`,x2:`3`,y2:`15`,stroke:`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`})],-1)]]),_:1},8,[`onClick`]))}}),[[`__scopeId`,`data-v-f20d9633`]]),st=[`aria-expanded`,`aria-controls`],ct=[`id`],lt=k(t({__name:`DocsDisclosure`,props:b({label:{},collapseBelow:{}},{open:{type:Boolean,default:!1},openModifiers:{}}),emits:[`update:open`],setup(e){let t=d(e,`open`),r=T(),a=i(null);function o(e){let n=a.value;!t.value||!n||getComputedStyle(n).display===`none`||(e.stopPropagation(),t.value=!1,n.focus())}return(i,c)=>(y(),x(`div`,{class:E([`doc-disclosure`,[`doc-disclosure--${e.collapseBelow}`,{"doc-disclosure--open":t.value}]]),onKeydown:n(o,[`esc`])},[s(`button`,{ref_key:`buttonRef`,ref:a,type:`button`,class:`doc-disclosure__button`,"aria-expanded":t.value,"aria-controls":u(r),onClick:c[0]||=e=>t.value=!t.value},[s(`span`,null,f(e.label),1),l(ie,{open:t.value},null,8,[`open`])],8,st),s(`div`,{id:u(r),class:`doc-disclosure__region`},[h(i.$slots,`default`,{},void 0,!0)],8,ct)],34))}}),[[`__scopeId`,`data-v-4acd747a`]]),ut={key:1,class:`doc-group-icon`,width:`19`,height:`19`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,"stroke-linejoin":`round`,"aria-hidden":`true`},dt={key:1,d:`M14.5 6.5a3.8 3.8 0 0 0 4.6 4.8l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.8 3.8 0 0 0 4.8-4.6l-2.6 2.6-2.2-.4-.4-2.2z`},ft=t({__name:`DocsGroupIcon`,props:{groupKey:{}},setup(e){let t=e,n=[`app`,`air`,`space`,`sea`,`land`,`sdr`],r=p(()=>n.includes(t.groupKey));return(t,n)=>r.value?(y(),a(pe,{key:0,"section-key":e.groupKey,class:`doc-group-icon`},null,8,[`section-key`])):(y(),x(`svg`,ut,[e.groupKey===`get-started`?(y(),x(o,{key:0},[n[0]||=s(`line`,{x1:`6`,y1:`3`,x2:`6`,y2:`21`},null,-1),n[1]||=s(`path`,{d:`M6 4.5h11.5L15 9l2.5 4.5H6`},null,-1)],64)):e.groupKey===`set-up-and-run`?(y(),x(`path`,dt)):(y(),x(o,{key:2},[n[2]||=s(`polyline`,{points:`8 7 3 12 8 17`},null,-1),n[3]||=s(`polyline`,{points:`16 7 21 12 16 17`},null,-1),n[4]||=s(`line`,{x1:`13.8`,y1:`5`,x2:`10.2`,y2:`19`},null,-1)],64))]))}}),pt={class:`doc-rail theme-dark`,"aria-label":`Documentation sections`},mt=k(t({__name:`DocsGroupRail`,props:{groups:{},activeGroupKey:{}},setup(e){return(t,n)=>{let r=C(`RouterLink`);return y(),x(`nav`,pt,[s(`ul`,null,[(y(!0),x(o,null,v(e.groups,t=>(y(),x(`li`,{key:t.key},[l(r,{to:t.pages[0]?.url??`/doc/`,custom:``},{default:w(({href:n,navigate:r})=>[l(O,{class:`doc-rail__item`,href:n,"accessible-name":t.title,tooltip:t.title,active:t.key===e.activeGroupKey,current:t.key===e.activeGroupKey,onClick:r},{default:w(()=>[l(ft,{"group-key":t.key},null,8,[`group-key`])]),_:2},1032,[`href`,`accessible-name`,`tooltip`,`active`,`current`,`onClick`])]),_:2},1032,[`to`])]))),128))])])}}}),[[`__scopeId`,`data-v-cd986e17`]]),ht=[`id`],gt=k(t({__name:`DocsHeading`,props:{id:{}},setup(e){return(t,n)=>(y(),x(`h1`,{id:e.id||void 0,class:`doc-heading`,tabindex:`-1`},[n[0]||=s(`span`,{class:`doc-heading__dot`,"aria-hidden":`true`},null,-1),s(`span`,null,[h(t.$slots,`default`,{},void 0,!0)])],8,ht))}}),[[`__scopeId`,`data-v-a1596b33`]]),_t={id:`docs-live-status`,class:`sr-only`,role:`status`,"aria-live":`polite`,"data-testid":`docs-live-status`},vt=t({__name:`DocsLiveStatus`,setup(e){let t=A();return(e,n)=>(y(),x(`div`,_t,f(u(t).announcement),1))}}),yt=150,bt=t({__name:`DocsSearchField`,props:{modelValue:{},shortcut:{type:Boolean,default:!0},landmark:{type:Boolean,default:!0}},emits:[`update:modelValue`,`focus-results`],setup(e,{expose:t,emit:n}){let o=e,s=n,c=i(o.modelValue),l=i(null),u;r(()=>o.modelValue,e=>{e!==c.value&&(c.value=e)});function d(e=!1){clearTimeout(u),(e||c.value!==o.modelValue)&&s(`update:modelValue`,c.value)}r(c,()=>{clearTimeout(u),u=setTimeout(()=>d(),yt)});function f(e){e.key===`Escape`?(e.stopPropagation(),c.value!==``&&(e.preventDefault(),c.value=``,d())):e.key===`Enter`?d(!0):e.key===`ArrowDown`&&(e.preventDefault(),d(),s(`focus-results`))}function p(e){return e instanceof HTMLElement&&e.closest(`input, textarea, select, [contenteditable]`)!==null}return re(`keydown`,e=>{!o.shortcut||e.key!==`/`||e.ctrlKey||e.metaKey||e.altKey||p(e.target)||(e.preventDefault(),l.value?.focus())}),S(()=>clearTimeout(u)),t({focus:()=>l.value?.focus(),select:()=>l.value?.select()}),(t,n)=>(y(),a(oe,{ref_key:`fieldRef`,ref:l,modelValue:c.value,"onUpdate:modelValue":n[0]||=e=>c.value=e,class:`doc-search-field`,landmark:e.landmark,label:`Search the docs`,placeholder:`SEARCH DOCS`,"clear-label":`Clear search`,onKeydown:f,onClear:n[1]||=e=>d()},null,8,[`modelValue`,`landmark`]))}}),xt={class:`doc-not-found`},St=k(t({__name:`DocsNotFound`,props:{requestedPath:{}},emits:[`search`],setup(e,{emit:t}){let n=e,r=t,a=i(null),o=n.requestedPath.split(`/`).filter(Boolean).pop()??``;return _(()=>{a.value?.focus(),a.value?.select()}),(t,n)=>{let i=C(`RouterLink`);return y(),x(`div`,xt,[s(`p`,null,[n[1]||=m(` There's no page at `,-1),s(`code`,null,`/doc/`+f(e.requestedPath),1),n[2]||=m(`. It may have moved. `,-1)]),s(`p`,null,[l(i,{to:`/doc/`},{default:w(()=>[...n[3]||=[m(`Welcome to Sentinel`,-1)]]),_:1})]),n[4]||=s(`p`,{class:`doc-not-found__prompt`},`Or search for it:`,-1),l(bt,{ref_key:`searchRef`,ref:a,class:`doc-not-found__search`,"model-value":u(o),shortcut:!1,landmark:!1,"onUpdate:modelValue":n[0]||=e=>r(`search`,e)},null,8,[`model-value`])])}}}),[[`__scopeId`,`data-v-d016b956`]]);function Ct(e){let t=i(``),n=new Set,a=null;function o(){let r=e.value.find(e=>n.has(e));r!==void 0&&(t.value=r)}function s(){if(a?.disconnect(),n.clear(),t.value=``,!(typeof IntersectionObserver>`u`)){a=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting?n.add(t.target.id):n.delete(t.target.id);o()},{rootMargin:`0px 0px -70% 0px`});for(let t of e.value){let e=document.getElementById(t);e&&a.observe(e)}}}return r(e,s,{immediate:!0,flush:`post`}),S(()=>a?.disconnect()),t}var wt={key:0,class:`doc-toc`,"aria-label":`On this page`},Tt={class:`doc-toc__list`},Et=k(t({__name:`DocsOnThisPage`,props:{entries:{},pageUrl:{}},setup(e){let t=e,n=i(!1),r=Ct(p(()=>t.entries.map(e=>e.id)));return(t,i)=>{let a=C(`RouterLink`);return e.entries.length>0?(y(),x(`nav`,wt,[l(lt,{open:n.value,"onUpdate:open":i[0]||=e=>n.value=e,label:`On this page`,"collapse-below":`wide`},{default:w(()=>[i[1]||=s(`p`,{class:`doc-toc__label`,"aria-hidden":`true`},`ON THIS PAGE`,-1),s(`ol`,Tt,[(y(!0),x(o,null,v(e.entries,t=>(y(),x(`li`,{key:t.id,class:E(`doc-toc__item--h${t.level}`)},[l(a,{class:E([`doc-toc__link`,{"doc-toc__link--current":t.id===u(r)}]),to:{path:e.pageUrl,hash:`#${t.id}`},"aria-current":t.id===u(r)?`location`:void 0},{default:w(()=>[m(f(t.text),1)]),_:2},1032,[`class`,`to`,`aria-current`])],2))),128))])]),_:1},8,[`open`])])):c(``,!0)}}}),[[`__scopeId`,`data-v-98b2a655`]]),Dt=`https://github.com/barrygee/Sentinel`,Ot=`${Dt}/blob/main/CHANGELOG.md`,kt=/^[a-z][a-z0-9+.-]*:/i;function At(e,t){let n=[...t.startsWith(`/`)?[]:e.split(`/`).slice(0,-1)];for(let e of t.split(`/`))e===``||e===`.`||(e===`..`?n.pop():n.push(e));return n.join(`/`)}function jt(e,t,n){if(kt.test(e)||e.startsWith(`//`))return{kind:`external`,href:e,opensNewTab:!e.toLowerCase().startsWith(`mailto:`)};if(e.startsWith(`#`))return{kind:`hash`,hash:e};let r=e.indexOf(`#`),i=r===-1?e:e.slice(0,r),a=r===-1?``:e.slice(r),o=At(t,decodeURI(i)),s=n.pageByFile.get(o);return s?{kind:`page`,page:s,hash:a}:{kind:`external`,href:`${Dt}/${i.endsWith(`/`)?`tree`:`blob`}/main/${o}${a}`,opensNewTab:!0}}function Mt(e,t,n){if(kt.test(e)||e.startsWith(`//`)||e.startsWith(`data:`))return e;let r=At(t,decodeURI(e));return n[r]??`https://raw.githubusercontent.com/barrygee/Sentinel/main/${r}`}var Nt=[`aria-label`],Pt={class:`doc-page-list__label`},Ft={class:`doc-page-list__pages`},It={key:0},Lt=[`href`,`aria-current`,`onClick`],Rt={key:1,class:`doc-page-list__subgroup`},zt={class:`doc-page-list__sublabel`},Bt=[`aria-label`],Vt=[`href`,`aria-current`,`onClick`],Ht={class:`doc-page-list__external`},Ut=[`href`],Wt=k(t({__name:`DocsPageList`,props:{group:{},currentPath:{}},setup(e){function t(e,t){return e.path===t}return(n,r)=>{let i=C(`RouterLink`);return y(),x(o,null,[e.group?(y(),x(`nav`,{key:0,class:`doc-page-list`,"aria-label":`Pages in ${e.group.title}`},[s(`p`,Pt,f(e.group.title),1),s(`ol`,Ft,[(y(!0),x(o,null,v(e.group.entries,n=>(y(),x(o,{key:n.kind===`page`?n.page.path:n.subgroup.title},[n.kind===`page`?(y(),x(`li`,It,[l(i,{to:n.page.url,custom:``},{default:w(({href:r,navigate:i})=>[s(`a`,{class:E([`doc-page-list__link`,{"doc-page-list__link--current":t(n.page,e.currentPath)}]),href:r,"aria-current":t(n.page,e.currentPath)?`page`:void 0,onClick:i},f(n.page.title),11,Lt)]),_:2},1032,[`to`])])):(y(),x(`li`,Rt,[s(`p`,zt,f(n.subgroup.title),1),s(`ol`,{class:`doc-page-list__pages doc-page-list__pages--nested`,"aria-label":n.subgroup.title},[(y(!0),x(o,null,v(n.subgroup.pages,n=>(y(),x(`li`,{key:n.path},[l(i,{to:n.url,custom:``},{default:w(({href:r,navigate:i})=>[s(`a`,{class:E([`doc-page-list__link`,{"doc-page-list__link--current":t(n,e.currentPath)}]),href:r,"aria-current":t(n,e.currentPath)?`page`:void 0,onClick:i},f(n.title),11,Vt)]),_:2},1032,[`to`])]))),128))],8,Bt)]))],64))),128))])],8,Nt)):c(``,!0),s(`p`,Ht,[s(`a`,{href:u(Ot),target:`_blank`,rel:`noopener noreferrer`},[...r[0]||=[m(`What's new (online only) `,-1),s(`span`,{"aria-hidden":`true`},`↗`,-1),s(`span`,{class:`sr-only`},`(opens in a new tab)`,-1)]],8,Ut)])],64)}}}),[[`__scopeId`,`data-v-dbdf3c21`]]),Gt={key:0,class:`doc-prev-next`,"aria-label":`Previous and next page`},Kt={class:`doc-prev-next__title`},qt={key:1},Jt={class:`doc-prev-next__title`},Yt=k(t({__name:`DocsPrevNext`,props:{previous:{},next:{}},setup(e){return(t,n)=>{let r=C(`RouterLink`);return e.previous||e.next?(y(),x(`nav`,Gt,[e.previous?(y(),a(r,{key:0,class:`doc-prev-next__cell`,to:e.previous.url,rel:`prev`},{default:w(()=>[n[0]||=s(`span`,{class:`doc-prev-next__direction`},`‹ PREVIOUS`,-1),s(`span`,Kt,f(e.previous.title),1)]),_:1},8,[`to`])):(y(),x(`span`,qt)),e.next?(y(),a(r,{key:2,class:`doc-prev-next__cell doc-prev-next__cell--next`,to:e.next.url,rel:`next`},{default:w(()=>[n[1]||=s(`span`,{class:`doc-prev-next__direction`},`NEXT ›`,-1),s(`span`,Jt,f(e.next.title),1)]),_:1},8,[`to`])):c(``,!0)])):c(``,!0)}}}),[[`__scopeId`,`data-v-d5081d79`]]);function Xt(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}function Zt(e){let t=[...new Set(e.map(e=>e.trim()).filter(e=>e!==``))];return t.length===0?null:(t.sort((e,t)=>t.length-e.length),RegExp(`(?<![\\p{L}\\p{N}_-])(${t.map(Xt).join(`|`)})`,`giu`))}function Qt(e,t){let n=Zt(t);return n===null||e===``?[{text:e,match:!1}]:e.split(n).map((e,t)=>({text:e,match:t%2==1})).filter(e=>e.text!==``)}function $t(e,t,n=90){let r=Zt(t)?.exec(e)?.index??-1,i=Math.max(0,r===-1?0:r-n),a=Math.min(e.length,i+n*2),o=e.slice(i,a);return i>0&&(o=o.replace(/^\S*\s/,``)),a<e.length&&(o=o.replace(/\s\S*$/,``)),`${i>0?`…`:``}${o}${a<e.length?`…`:``}`}var en={class:`doc-search-result`},tn={class:`doc-search-result__line`},nn={class:`doc-search-result__title`},rn={key:0},an={class:`doc-search-result__heading`},on={key:0},sn={key:0,class:`doc-search-result__snippet`},cn={key:0},ln=k(t({__name:`DocsSearchResult`,props:{hit:{},pageUrl:{}},setup(e){let t=e,n=p(()=>({path:t.pageUrl,hash:t.hit.section.headingId?`#${t.hit.section.headingId}`:``})),r=p(()=>Qt(t.hit.section.pageTitle,t.hit.matchedTerms)),i=p(()=>Qt(t.hit.section.heading,t.hit.matchedTerms)),a=p(()=>Qt(t.hit.snippet,t.hit.matchedTerms)),u=p(()=>t.hit.section.headingId!==``);return(t,d)=>{let p=C(`RouterLink`);return y(),x(`li`,en,[l(p,{class:`doc-search-result__link`,to:n.value},{default:w(()=>[s(`span`,tn,[s(`span`,nn,[(y(!0),x(o,null,v(r.value,(e,t)=>(y(),x(o,{key:t},[e.match?(y(),x(`mark`,rn,f(e.text),1)):(y(),x(o,{key:1},[m(f(e.text),1)],64))],64))),128))]),u.value?(y(),x(o,{key:0},[d[0]||=s(`span`,{class:`doc-search-result__separator`,"aria-hidden":`true`},` › `,-1),d[1]||=s(`span`,{class:`sr-only`},` section `,-1),s(`span`,an,[(y(!0),x(o,null,v(i.value,(e,t)=>(y(),x(o,{key:t},[e.match?(y(),x(`mark`,on,f(e.text),1)):(y(),x(o,{key:1},[m(f(e.text),1)],64))],64))),128))])],64)):c(``,!0)]),e.hit.snippet?(y(),x(`span`,sn,[(y(!0),x(o,null,v(a.value,(e,t)=>(y(),x(o,{key:t},[e.match?(y(),x(`mark`,cn,f(e.text),1)):(y(),x(o,{key:1},[m(f(e.text),1)],64))],64))),128))])):c(``,!0)]),_:1},8,[`to`])])}}}),[[`__scopeId`,`data-v-b81204a0`]]),un={class:`doc-search-results__empty`},dn={class:`doc-search-results__summary`},fn={class:`doc-search-results__group-title`},pn={class:`doc-search-results__list`},mn=k(t({__name:`DocsSearchResults`,props:{query:{},outcome:{},library:{}},emits:[`focus-field`],setup(e,{expose:t,emit:n}){let r=e,c=n,l=i(null),u=p(()=>{let e=r.outcome?.hits??[];return r.library.groups.map(t=>({key:t.key,title:t.title,hits:e.filter(e=>e.section.groupKey===t.key)})).filter(e=>e.hits.length>0)}),d=p(()=>r.outcome?.hits.length??0),m=p(()=>(r.outcome?.expansions??[]).map(e=>e.alsoSearching[0]??``)),h=p(()=>{let e=d.value===1?`result`:`results`,t=r.outcome?.totalHits??0,n=t>d.value?`Showing ${d.value} of ${t}`:`${d.value}`,i=m.value.length>0?` · also searching ${m.value.join(`, `)}`:``;return`${n} ${e} for “${r.query.trim()}”${i}`});function g(e){return r.library.pageByPath.get(e.section.pagePath)?.url??`/doc/`}function _(){return Array.from(l.value?.querySelectorAll(`.doc-search-result a`)??[])}function b(e){if(e.key!==`ArrowDown`&&e.key!==`ArrowUp`)return;let t=_(),n=t.findIndex(e=>e===document.activeElement);n!==-1&&(e.preventDefault(),e.key===`ArrowDown`?t[Math.min(n+1,t.length-1)]?.focus():n===0?c(`focus-field`):t[n-1]?.focus())}return t({focusFirst:()=>_()[0]?.focus()}),(t,n)=>(y(),x(`div`,{ref_key:`rootRef`,ref:l,class:`doc-search-results`,onKeydown:b},[d.value===0?(y(),x(o,{key:0},[s(`p`,un,` NO RESULTS FOR “`+f(e.query.trim().toUpperCase())+`” `,1),n[0]||=s(`p`,{class:`doc-search-results__hint`},`Try other words, or browse the sections on the left.`,-1)],64)):(y(),x(o,{key:1},[s(`p`,dn,f(h.value),1),(y(!0),x(o,null,v(u.value,e=>(y(),x(`section`,{key:e.key,class:`doc-search-results__group`},[s(`h2`,fn,f(e.title),1),s(`ol`,pn,[(y(!0),x(o,null,v(e.hits,e=>(y(),a(ln,{key:e.section.id,hit:e,"page-url":g(e)},null,8,[`hit`,`page-url`]))),128))])]))),128))],64))],544))}}),[[`__scopeId`,`data-v-63c57e15`]]);function hn(e,t,n,i){r([e,t],async([,t],r)=>{let[a]=r??[];if(await g(),n.value)return;if(a!==e.value)for(let e of i.scrollRegions.value)e&&(e.scrollTop=0);let o=document.activeElement;if(o instanceof HTMLInputElement||o instanceof HTMLTextAreaElement)return;let s=t===``?null:i.findAnchorTarget(t);if(s){s.scrollIntoView({block:`start`}),s.focus({preventScroll:!0});return}i.findPageHeading()?.focus({preventScroll:!0})},{immediate:!0,flush:`post`})}var gn=[`get-started`,`app`,`air`,`space`,`sea`,`land`,`sdr`,`set-up-and-run`,`develop`],_n=`index`,M=class extends Error{constructor(e){super(`docs/nav.json: ${e}`),this.name=`DocsNavigationError`}};function vn(e){return e===`index`?`/doc/`:`/doc/${e}`}function yn(e){let t=e.replace(/^\/+|\/+$/g,``);return t===``?_n:t}function bn(e){return e.replace(/^(\.\.\/)+/,``)}function xn(e){return typeof e==`object`&&!!e&&!Array.isArray(e)}function Sn(e,t,n){let r=e[t];if(typeof r!=`string`||r.trim()===``)throw new M(`${n} needs a non-empty string "${t}"`);return r}function Cn(e){return gn.includes(e)}function wn(e,t){if(!xn(e)||!Array.isArray(e.groups))throw new M(`expected an object with a "groups" array`);let n=new Map,r=new Map,i=[],a=new Set;function o(e,i,a,o){if(!xn(e))throw new M(`${i} must be an object`);let s=Sn(e,`path`,i),c=Sn(e,`title`,i),l=typeof e.file==`string`?e.file:`docs/${s}.md`;if(n.has(s))throw new M(`${i}: duplicate page path "${s}"`);let u=t[l];if(u===void 0)throw new M(`${i}: "${s}" points at ${l}, which was not bundled (is the file missing, or under docs/plans?)`);let d={path:s,url:vn(s),title:c,file:l,markdown:u,groupKey:a.key,groupTitle:a.title,...o===void 0?{}:{subgroupTitle:o}};return n.set(s,d),r.set(l,d),d}e.groups.forEach((e,t)=>{let n=`groups[${t}]`;if(!xn(e))throw new M(`${n} must be an object`);let r=Sn(e,`key`,n);if(!Cn(r))throw new M(`${n}: unknown group key "${r}"`);if(a.has(r))throw new M(`${n}: duplicate group "${r}"`);a.add(r);let s=Sn(e,`title`,n);if(!Array.isArray(e.pages))throw new M(`${n} needs a "pages" array`);let c=[],l=[];e.pages.forEach((e,t)=>{let i=`${n}.pages[${t}]`;if(xn(e)&&Array.isArray(e.pages)){let t=Sn(e,`title`,i),n=e.pages.map((e,n)=>o(e,`${i}.pages[${n}]`,{key:r,title:s},t));c.push({kind:`subgroup`,subgroup:{title:t,pages:n}}),l.push(...n)}else{let t=o(e,i,{key:r,title:s},void 0);c.push({kind:`page`,page:t}),l.push(t)}}),l.length>0&&i.push({key:r,title:s,entries:c,pages:l})});let s={};if(e.synonyms!==void 0){if(!xn(e.synonyms))throw new M(`"synonyms" must be an object`);for(let[t,n]of Object.entries(e.synonyms)){if(!Array.isArray(n)||n.some(e=>typeof e!=`string`))throw new M(`synonyms["${t}"] must be an array of strings`);s[t.toLowerCase()]=n}}return{groups:i,pages:i.flatMap(e=>e.pages),pageByPath:n,pageByFile:r,synonyms:s}}function Tn(e,t){let n=e.pages.findIndex(e=>e.path===t);return n===-1?{previous:null,next:null}:{previous:e.pages[n-1]??null,next:e.pages[n+1]??null}}var En='# Contributing to Sentinel\n\nThanks for working on Sentinel. This page covers how changes get in: branches, commit messages and pull requests. Everything else a developer needs is in the docs:\n\n- [Set up for development](docs/development/setup.md): tools, first-time set-up and the dev loop.\n- [Code map](docs/development/code-map.md)\n- [Testing](docs/development/testing.md): every check CI runs, and the 100% coverage rule.\n- [How to…](docs/development/how-to.md) add a setting, a section, a decoder or a map control, and ship a frontend change.\n- [How it works](docs/architecture/overview.md)\n\nNever commit a `.env` file or any secret.\n\n## Branches\n\n- **Never commit to `main`.** Branch off the latest `main` for every change, however small.\n- Name the branch after the kind of change: `type/short-kebab-description`, such as `feat/sdr-scanner`, `fix/adsb-filter-flash` or `docs/contributing`.\n- One logical change per branch.\n\n## Commits\n\nSentinel uses [Conventional Commits](https://www.conventionalcommits.org). The changelog is written from them automatically, so a vague message becomes a vague changelog line.\n\n```text\ntype(scope): short imperative subject\n\noptional body explaining why\n```\n\n| Type | Changelog heading | Use for |\n|---|---|---|\n| `feat` | Features | Something new a user can do |\n| `fix` | Bug Fixes | A bug fix |\n| `perf` | Performance | Faster or lighter, same behaviour |\n| `refactor` | Refactoring | Restructuring with no change in behaviour |\n| `docs` | Documentation | Docs only |\n| `test` | Tests | Adding or fixing tests |\n| `build` | Build System | Build, tooling and dependency mechanics, including rebuilding `frontend/spa-dist/` |\n| `ci` | Continuous Integration | CI workflows |\n| `style` | Styling | Formatting only |\n| `chore` | Chores | Other maintenance (`chore(deps)` goes under Dependencies) |\n| `revert` | Reverts | Undoing an earlier commit |\n\nThe mapping lives in [`cliff.toml`](cliff.toml).\n\n- Keep each commit to **one logical change**. Don\'t fold an unrelated refactor into a feature.\n- Write the subject in the **imperative**: "add", not "added" or "adds".\n- Mark a breaking change with `!` after the type or scope (`feat!:`), or a `BREAKING CHANGE:` footer.\n- A frontend change and its rebuilt `frontend/spa-dist/` go in separate commits: the change first, then `build(spa): …`.\n\n## Pull requests\n\n1. **Keep it focused**: one change per pull request. Small ones are reviewed faster and are easier to revert.\n2. **Run the checks** in [Testing](docs/development/testing.md) first, including the browser tests for any UI change.\n3. **Read your own diff** as a reviewer would before you ask anyone else to.\n4. **Open it against `main`**, with a description that says what changed, why, how you tested it, and any breaking change. Add screenshots for UI changes.\n5. **Every CI check must pass**, and new frontend code must be at 100% coverage.\n\nThe **changelog updates itself.** After each merge to `main`, a GitHub Action (`.github/workflows/changelog.yml`, using git-cliff) rewrites `CHANGELOG.md` from the commits and commits it to `main`. It never touches your branch. Don\'t edit `CHANGELOG.md` by hand.\n',Dn=`# 0001. Retrofit Sentinel to the webapp standards

Date: 2026-06-14
Status: accepted

## Context

Sentinel predates the team's current web-app standards — the conventions a
greenfield project now gets for free (Conventional-Commit changelog automation,
linting/formatting gates, CI, pre-commit hooks, a real test harness with a
coverage gate, accessibility to WCAG 2.2 AA, and onboarding docs). Because the
codebase grew before those defaults existed, it had:

- no automated CHANGELOG and no enforced commit/branch conventions;
- no shared linting/formatting configuration or CI gate, so style and quality
  drifted per author;
- no frontend test harness and effectively no test coverage on the Vue SPA — the
  largest files (\`SdrPanel.vue\` ~4.2k lines, \`AdsbLiveControl\` ~2.8k lines) were
  wholly untested, making any change high-risk;
- numerous accessibility gaps (no visible focus, unlabelled inputs and icon
  buttons, no landmarks/headings, no live regions, a map canvas opaque to
  assistive tech, no reduced-motion support);
- thin project documentation for a newcomer to set up, run, and contribute.

The forces at play: the app is actively maintained and shipping, so the retrofit
had to be incremental and non-breaking (no big-bang rewrite), had to keep CI
green at every step, and had to ratchet quality upward without ever regressing
it. The codebase also has three distinct tooling contexts (the Vue SPA under
\`frontend/vue/\` on vitest, root build helpers on jest, and the Python backend on
uv/ruff/pytest), so any standard had to be applied per-context rather than
globally.

## Decision

Retrofit Sentinel to the full webapp-standards baseline as a multi-phase effort,
**one branch + PR per slice off \`main\`**, each slice landing at 100% coverage of
its files with green CI, never committing to \`main\`. The nine phases:

1. **Changelog automation** — git-cliff + a GitHub Action that regenerates
   \`CHANGELOG.md\` per PR from Conventional Commits.
2. **Linting foundation** — ESLint + Prettier (JS/TS/Vue) and ruff (Python),
   with ruff-format as the gating Python formatter.
3. **Base CI** — \`.github/workflows/ci.yml\` running the per-context lint, type,
   and test gates.
4. **Pre-commit** — husky + lint-staged.
5. **Vue test harness** — vitest + @vue/test-utils + jest-axe + coverage.
6. **Frontend test backfill** — every store, util, composable, component, and
   view to 100%, with the vitest coverage threshold ratcheted upward after each
   slice until it reached a flat 100% gate.
7. **Accessibility audit** — a read-only static WCAG 2.2 AA audit (12 findings).
8. **Accessibility remediation** — fix all 12 findings (focus, names/labels,
   landmarks/headings, live regions, the modal-dialog pattern, the map's
   accessible name + data alternative, non-semantic clickables, target sizes),
   then remove the audit report.
9. **Docs sweep** — \`CONTRIBUTING.md\`, refreshed \`README.md\` and \`CLAUDE.md\`
   covering the three tooling contexts and the "what's enforced where" matrix.

A follow-up slice (8-7) added a real-browser \`@axe-core/playwright\` suite and
**wired it into the gating CI**, because jsdom/jest-axe physically cannot see
color-contrast, target-size, or \`display:none\`-hidden-label name gaps — and the
live pass immediately caught two genuine WCAG AA bugs that the component-level
tests had missed.

Two source bugs surfaced by the test backfill were fixed in-line (a satellite
heads-up scheduling infinite-recursion and a per-pass alert-dedup defect), and
dead code uncovered during testing was removed slice-by-slice.

## Consequences

**What this enables**

- The whole Vue frontend is now at 100% coverage with a 100% CI gate, so any
  regression in covered code fails the build. Large, previously-untouchable files
  are now safe to change.
- Accessibility is enforced, not aspirational: all 12 audit findings are
  remediated, and a real-browser axe suite gates every push/PR/merge in CI.
- Commits, changelog, linting, formatting, and types are all gated consistently
  across the three tooling contexts; a newcomer can go from clone to running app
  and passing tests from the README/CONTRIBUTING alone.

**What it costs / trade-offs**

- The 100% frontend coverage gate is strict. Genuinely unreachable defensive
  branches are excluded with justified \`/* v8 ignore start … stop */\` blocks
  rather than contrived tests; new code must ship with tests to that bar.
- The live axe CI step installs a Chromium binary and runs a browser e2e on every
  CI run, adding time and a cache dependency. It is intentionally **not** a
  pre-push husky hook (too heavy locally); CI is the gate.
- The committed \`spa-dist\` build artifact must be rebuilt whenever runtime DOM
  changes (it is pretty-printed by root lint-staged — the established repo
  pattern), adding a build step to a11y/runtime slices.

**Out of scope (deliberately not done here)**

- Release/version tagging, mypy \`Mapped[T]\` cleanup, and the sea/land domains.
- A manual VoiceOver/NVDA screen-reader pass on the running app — recommended
  before release; the axe-core/Playwright CI gate is the automated substitute,
  not a full replacement.
`,On="# 0002. Dedupe the Vue SPA onto base components (B-series)\n\nDate: 2026-07-12\nStatus: accepted\n\n## Context\n\nTwo exhaustive inventories of `frontend/vue/src` (2026-07-12, following the\nSdrPanel decomposition series P0–P7, PRs #190–#197) found substantial UI\nduplication that the existing 13-primitive `components/base/` layer does not\nyet absorb:\n\n- **Teleported dropdown pattern:** five SDR pickers (`SdrStepPicker`,\n  `SdrSampleRatePicker`, `SdrDeviceSelector`, `SdrSettingsAccordion`,\n  `SdrTrunkSection`) carried near-verbatim copies of the same menu state,\n  positioning, settle-window scroll dismissal and listener registrations\n  (~250 script lines + ~90 template lines). The settings panel re-implements\n  the same visual a second way (`tle-dropdown`, 3 files) and `AirReplayPanel`\n  a third way with hand-rolled dismissal.\n- **Accordion headers:** 5 byte-identical copies of the SDR header-row +\n  chevron toggle, plus 2 near-copies in `SdrFrequencyManagerTab`.\n- **Pills/chips/segmented toggles:** ~25 instances (`sdr-mode-pill` ×10+ incl.\n  the tune/stop/rec/decode transport buttons, scan group chips, pass category\n  chips, `settings-source-override-btn` shared across two settings files,\n  `SdrDeviceForm` ENABLED/DISABLED, replay speed pills).\n- **Icon row-actions:** ~15 tooltip'd action buttons across\n  `AirFilter`/`SpaceFilter`/`SpacePasses`/`SdrRecordingsSection`/\n  `SdrDecodeDock` using the exact `data-tooltip` mechanism `BaseIconButton`\n  centralises, but in a non-rail shape; plus bare-glyph row actions and 4\n  identical \"clear search ✕\" buttons.\n- **Underadopted primitives:** `BaseListItem` has zero importers despite 6+\n  hand-rolled row sites shaped like it; ~7 files re-implement the same\n  empty-state/hint label.\n- **Other:** 3 unrelated custom-checkbox families; 4 near-identical slider\n  rows; ~90 duplicated lines (formatters + RADIO grid template) between\n  `SpaceFilter` and `SpacePasses`; `SdrPanel.css` (3,889 lines, global)\n  styling 10 components that own no styles.\n\n## Decision\n\nEliminate the duplication in a phased **B-series** — one small PR per phase,\nshared logic before primitives, primitives before adoptions. Variants compose\na base (slots + props + CSS custom-property hooks); they never copy it.\n\n| Phase | Deliverable | Removes |\n|---|---|---|\n| B0 | `useTeleportedMenu()` composable adopted by the 5 SDR pickers | ~250 verbatim script lines; zero visual change |\n| B1 | `BaseSelectMenu` primitive on B0 (trigger/option slots, opt-in keyboard nav) | the 5 pickers' duplicated templates |\n| B2 | `BaseAccordionSection` (title, `v-model:expanded`, header-extra + body slots) | 5 exact + 2 near-exact accordion headers |\n| B3 | `BasePillToggle` (no group wrapper: today it would be a classless pass-through div; it belongs with a deliberate radiogroup-ARIA pass, not a byte-identical dedupe). *The deferred pass shipped post-series as the SDR-controls a11y PR: single-select segmented groups (MODE pills ×5 forms, device ENABLED/DISABLED, source override, hover preview, playback speed) put `role=\"radiogroup\"` on their existing wrappers with `role=\"radio\"`/`aria-checked` pills driven by the `useRadioGroupKeyboard` composable (roving tabindex + arrow keys); multi-select chip groups (scan-group filter, edit-form GROUPS, pass categories) and the REC toggle got `aria-pressed`; momentary TUNE/STOP stay bare. No group wrapper component was needed — the family wrappers already existed.* | ~24 pill/chip/segmented buttons (the 25th \"chip\" is a decorative span in `SdrWaterfall` — styling reuse, not a toggle) |\n| B4 | `BaseIconAction`, the non-rail sibling of `BaseIconButton` (composes `BasePillToggle`; top/bottom/left tooltip anchoring + custom-prop pill restyling — none of these tooltips use the rail's left/right model) | 17 tooltip'd row actions, 10 bare glyphs, 4 clear-✕; 5 duplicated tooltip CSS blocks |\n| B5 | Adopt `BaseButton` ghost for the `sdr-panel-btn` CANCEL/SAVE/ADD family (ghost only — SAVE is a tint modifier of the same family, not the lime primary; ghost gained bg/hover-bg/radius/font-weight/letter-spacing hooks as the dark-theme mirror). `sdr-add-freq-btn` stays hand-rolled: its mixed-case accent look isn't a ghost | the family's chrome CSS (now hook mappings mirroring the original cascade rule-for-rule) across 12 button sites in 4 SDR files |\n| B6 | `BaseCheckbox` (checkmark slot) | 3 unrelated checkbox families |\n| B7 | `BaseSliderRow` (label + pre-formatted readout + raw-event range input). Waterfall's 3 rows stay: different structure (horizontal label, wrapped `v-model` slider, no readout) and CSS family — the hook did not fit | 4 SETTINGS slider rows |\n| B8 | DESCOPED on evidence (2026-07-15): the empty-state primitive already exists — `BaseList`'s `emptyText` default + `#empty` slot, adopted where it fits (TrackingPanel, recordings); the remaining \"empties\" are non-list one-offs a component can't absorb byte-identically (`settings-empty` light theme, `SdrDecodeDock`'s `<td colspan>`, `sdr-trunk-hint` paragraph, `sdr-panel-empty`'s JS-driven `display:none`), and `#msb-tracking-empty` (the one byte-identical duplicate of `.ba-list-empty`) is spec-pinned by id. `BaseListItem` retrofits fail the same test: every candidate row family owns layout+hover CSS that conflicts with (`.sdr-search-range-item:hover` = 0.06 vs the primitive's 0.04) or exactly duplicates the primitive's affordances — adoption would add a wrapper class and delete nothing. `BaseListItem` remains the primitive for NEW lists | — |\n| B9 | `SatRadioInfoSection` (class-prefix prop selects the caller's `sfr-acc`/`spp-acc` family) + shared `satRadioInfo.ts` utils (`formatHz`/`formatStatus`/`splitNotes`/`hasRadioInfo`, now directly unit-tested instead of v8-ignored). The scattered SDR `(hz/1e6).toFixed` calls were evaluated and left: they differ in precision and format (3/4 dp, kHz steps, unit-less) — a parameterised wrapper would add indirection without removing duplication | ~90 duplicated Space lines |\n| B10 | CSS co-location sweep, one family per PR (B10a…). Settled policy (2026-07-15): a family moves to its **sole renderer** — the feature component that puts the classes in the DOM (a base primitive owns a family only where its own template hardcodes the classes, e.g. `BaseSelectMenu`'s `sdr-device-dropdown/-menu` shell); moved blocks are **unscoped** `<style>` (scoped `[data-v]` selectors would raise specificity, and the classes often sit on base-component-rendered elements outside the adopter's scope). Cascade rule: `SdrPanel.css` is `SdrPanel.vue`'s *first* import, so component styles always land **after** it in module order — a family may move only when no equal-specificity rule remaining in another file targets the same elements (verified per PR in the built CSS; the once-feared per-picker menu modifiers `.sdr-step-menu`/`.sdr-trunk-menu` have no rules today, and all contextual overrides — `#sdr-mini-player …`, `.sdr-search-adhoc-col …`, `.sdr-ef-setting …`, `.sdr-settings-controls …` — are higher-specificity, hence order-immune). Shared stragglers (`.sdr-slider-header/-val`, rendered by both `BaseSliderRow` and the hand-rolled SAMPLE RATE header) go to `SdrSettingsAccordion`, the one component containing every renderer. Families that can't move without cascade risk stay, with the reason recorded here | B10a: the AGC checkbox family (`.sdr-agc-row`/`.sdr-checkbox-*`) → `SdrSettingsAccordion.vue`. B10b: the slider-row families — `.sdr-slider-header/-val` → `SdrSettingsAccordion.vue` (per the straggler rule), `.sdr-panel-slider` chrome → `BaseSliderRow.vue` (sole renderer; its `outline: none` is focus-safe because a11y.css restores `:focus-visible` with `!important`). B10c: the trunk family (`.sdr-trunk-*` + the `#sdr-trunk-section-body` context rules) → `SdrTrunkSection.vue`. B10d: the GROUPS tab families (`.sdr-group-pill*` live rules, `.sdr-frequency-manager-group-add-row`, `.sdr-panel-add-row`) → `SdrGroupsTab.vue`, moved as one ordered unit because the two add-row classes style the same element at equal specificity with conflicting padding; the pill edit/del glyph chrome stays grouped with its `.sdr-freq-row-edit` siblings in `SdrPanel.css`, and `.sdr-group-pill-dot`/`-default` stay as dead-CSS candidates (no renderer anywhere) for the verification pass. B10e: the recordings family (~580 lines — `.sdr-recording-*`, `.sdr-recordings-*`, `#sdr-recordings-*`) → `SdrRecordingsSection.vue`; stays behind: `@keyframes sdr-rec-pulse` (shared with the transport REC button; keyframes are global by name), the `:has()` pane-layout rules that only probe `.sdr-recordings-body`, and four dead-CSS candidates (`.sdr-rec-timer`, `.sdr-recordings-count`, the never-toggled `-hint-visible`/`-arrow-up` variants — the scroll hint is driven by inline `style.display`). B10f: the device-dropdown family → `BaseSelectMenu.vue` in ONE piece (trigger shell + teleported menu + item rules incl. `--selected`, preserving the internal `--active` → `--selected` order; the item classes are slot-rendered by the pickers but splitting the family would risk its internal cascade), and the connection-dot family (`.sdr-conn-dot`, `.sdr-dot-off/-on`) → `SdrDeviceSelector.vue`; stays behind: the contextual overrides (`#sdr-device-group-*`, `.sdr-search-adhoc-col`, `#sdr-mini-player` — higher specificity, order-immune) and three more dead-CSS candidates (`.sdr-dot-idle` — the dot binds a two-state ternary; `.sdr-device-menu--upward` — nothing adds the class; `.sdr-conn-label/-on/-off` — no renderer). B10g: the dead-CSS verification pass — every class and id selector in `SdrPanel.css` was checked against the full source corpus (`src/**` + specs + `e2e/**` + root `tests/`, including a sweep for dynamically-constructed class names, of which the codebase has none); **98 classes and 8 ids proved unrendered** — pre-Vue-migration leftovers (the whole `#sdr-mini-player` panel, `sdr-mgmt-*`, `sdr-modal-*`, the old `sdr-scanner-main/section-*` accordion, `sdr-tab-header/-title`, `sdr-search-row*` and the previously flagged candidates) — and their ~140 rules (~1,100 lines) deleted; a rule was removed only when *every* selector in it required a dead name, with three grouped selectors pruned member-wise. B10h: the same analysis over `SettingsPanel.css` — the owner map shows a healthy sheet (~100 of 165 classes belong to the `settings/*` sub-controls in clearly-labelled sections, the rest is panel chrome), so per-family co-location there is deliberately **left out of B10's scope**: the B-series-relevant families all stay by documented design (`tle-dropdown` = blur-dismiss by design per this ADR; `settings-source-override-btn` = B3's shared two-control family; `tle-cat-*` = B5's documented intentionally-distinct buttons), and relocating the rest is optional future work on the settled policy, not part of this series' goal. Dead CSS was deleted (27 rules: the removed theme switch, `settings-datasource-status*`, `settings-result-breadcrumb`, `#settings-btn.settings-btn-active`, `tle-info-toggle*`, `tle-section-heading`, `tle-uncat-select*`, `tle-dropdown-item--placeholder`, `sdr-devices-agc-*`) — with a dynamic-construction sweep first, which mattered: `tle-status-badge--*` and `settings-conn-override-val--*` are built via `:class=\"'…--' + var\"` and are live despite having no static occurrences |\n\nEvery phase keeps runtime behaviour byte-identical (same DOM classes, same\nevent/command cadence), holds the 100% coverage gate, ships jest-axe tests on\nnew components, keeps `e2e/sdr.spec.ts` green, and commits the rebuilt\n`frontend/spa-dist/` bundle.\n\n**Deliberately out of scope** (evidence, not guesswork): MapLibre IControl\nDOM-created buttons (centralised in `SentinelControlBase`; only\n`AdsbLiveControl`'s own toggle could optionally extend it — an imperative-layer\nchange); `AirSideMenu`'s 3D widget (tooltips open upward, excluded by\n`BaseIconButton`'s documented left/right model); `AirReplayPanel` calendar\ninternals (one-off widget); `sdr-device-btn` and `tle-cat-clear` (documented\nin `BaseButton` as intentionally distinct); the `AirFilter`/`SpaceFilter`\nalways-visible listboxes (an a11y structure, not dropdowns); one-off CTAs\n(`NoUrlOverlay`, `App.vue` nav overlay, `spp-action-btn`).\n\nThe `tle-dropdown` family's blur-dismiss model is deliberate; it folds into\n`BaseSelectMenu` only if the primitive grows a non-teleported mode, otherwise\nit stays.\n\n## Consequences\n\n- New base primitives own their styles (scoped/co-located), reversing the\n  P-series convention of parking extracted components' CSS in the global\n  `SdrPanel.css`; the global sheets shrink as phases land.\n- The plan is recorded here because the P-series plan doc was never committed\n  and its final phase's scope was lost.\n- Phase statuses are tracked in the PRs (search: \"base dedupe B\" /\n  `refactor/use-teleported-menu` onwards).\n- **The series is COMPLETE (2026-07-16, B0–B10 across PRs #198–#206 and\n  #207 onwards; B8 descoped on evidence).** B10 ran as seven sub-phase PRs\n  (B10a–B10g on `SdrPanel.css`, B10h on `SettingsPanel.css`): every\n  component-owned family was co-located per the settled policy in the B10\n  row, ~1,100 lines of verified-dead pre-Vue CSS were deleted, and\n  `SdrPanel.css` shrank from 3,889 lines to ~1,830 — what remains is\n  SdrPanel.vue's own styling plus the shared multi-renderer families\n  (`sdr-panel-btn/-input`, `sdr-field-label`, `sdr-radio-section`,\n  `sdr-freq-row-*`, `sdr-editfreq-*`) that have no sole owner by design.\n  `SettingsPanel.css` remains the settings surface's sectioned sheet\n  (B10h row); relocating its sub-control families is optional future work\n  on the same policy, not a gap in this series.\n\n## Amendment (2026-08-15) — `SdrTrunkSection` no longer exists\n\nTrunk tracking was removed in ADR-0004, taking `SdrTrunkSection.vue` and its\nCSS family with it. The record above is left as written — it describes the\ninventory that motivated the B-series at the time — but three of its references\nnow point at code that is gone:\n\n- **Context, teleported dropdown pattern:** `SdrTrunkSection` was one of the\n  five pickers whose duplicated menu state motivated `BaseSelectMenu`. Four\n  remain (`SdrStepPicker`, `SdrSampleRatePicker`, `SdrDeviceSelector`,\n  `SdrSettingsAccordion`), which is still the case for the primitive.\n- **B8 (descoped):** the `sdr-trunk-hint` paragraph cited as a non-list \"empty\"\n  the primitive could not absorb no longer exists. The descope decision stands\n  on its remaining evidence.\n- **B10c:** the trunk CSS family (`.sdr-trunk-*` and the\n  `#sdr-trunk-section-body` context rules) was co-located into\n  `SdrTrunkSection.vue`, so it was deleted with that component. Co-location is\n  what made this a clean removal rather than a hunt through `SdrPanel.css` —\n  evidence for the B10 policy, not against it.\n\nNothing in the Decision is invalidated: the primitives, the settled co-location\npolicy and the completion status all stand.\n",kn=`# 0003. Lock and tune a Sentry SDR when AIR runs off grid

Date: 2026-08-13
Status: proposed

## Context

Off Grid air data now has a decoder (\`decoder/adsb\`, readsb) that pulls raw I/Q
from a Sentry \`rtl_tcp\` port and publishes \`aircraft.json\`. The pipeline is
proven end to end, and decodes nothing, because the dongle it reads is not tuned
to 1090 MHz.

Tuning it by hand in Sentry's console works but is the wrong shape for three
reasons:

- **It is invisible.** Nothing in Sentinel says the map is empty because a
  dongle 40 metres away is sitting on the wrong frequency. The failure looks
  identical to "no aircraft in range".
- **It is not exclusive.** A Sentry dongle is a single physical resource with
  several possible consumers — Sentinel's AIR, its voice decoder, its APRS
  decoder, a second Sentinel, or an operator in Sentry's own UI. Any of them
  can retune it out from under the others at any moment, and the one that
  loses simply stops decoding without being told why.
- **It does not survive.** A dongle replugged, a Pi rebooted, or a config
  imported can silently reset the tuning that AIR depends on.

The requirement is therefore: **entering AIR while off grid should claim the
source SDR and tune it**, and hold that claim for as long as AIR is the active
view.

Two facts found while investigating constrain the whole design.

### Sentinel cannot currently authenticate to Sentry at all

\`backend/services/sentry_client.py:155\` sends \`Authorization: Bearer <token>\`.
Sentry **never reads that header** — ADR-0010 (Sentry) replaced \`SENTRY_AUTH_TOKEN\`
with a console password proved by a signed \`sentry_session\` cookie, and
\`app/backend/security.py\` checks the cookie and nothing else.

So against a password-protected Sentry — which the deployed Pi is — *every*
management call Sentinel makes already fails with 401: device records, device
patches, serial flash. Only \`GET /api/health\` and \`GET /api/v1/sdrs\`, which are
deliberately unauthenticated, work. This is a live bug, not merely a blocker
for this feature, and nothing here can work until it is fixed.

### Sentinel does not know which SDR feeds AIR

Off Grid is configured as a *URL* (\`air.offgridDataSourceURL\`) pointing at a
decoder. Nothing records which **Sentry device** produced the samples behind
that URL, so there is no identity to lock or tune. The decoder container is told
its \`rtl_tcp\` host and port by environment variable, which is a third place the
same fact is written down.

## Decision

### 1. Sentinel authenticates to Sentry with the console password

Replace the ignored bearer token with the mechanism Sentry actually implements:
\`POST /api/auth/login {password}\` → store the returned \`sentry_session\` cookie →
send it on subsequent calls → re-login once on any 401.

The \`SentryHost.auth_token\` column becomes \`console_password\` in meaning. It is
already write-only and never returned by Sentinel's API, so its handling does
not change; only what it is and what is done with it.

Rejected: **adding machine tokens back to Sentry.** ADR-0010 removed them
deliberately, and a second credential type would have to be issued, stored,
rotated and revoked. A cookie is a header like any other — an HTTP client can
hold one perfectly well, and the only thing that made cookies awkward for Sentry
(\`EventSource\` cannot set headers) does not apply to a server-side client.

### 2. Sentry gains a device reservation ("lock")

A reservation is a **lease**, not a flag. The holder identifies itself, states
why, and the lease expires unless renewed.

New columns on \`sdr_devices\`:

| Column | Meaning |
| --- | --- |
| \`reserved_by\` | Opaque holder id, e.g. \`sentinel:<instance-uuid>\` |
| \`reserved_label\` | Operator-facing, e.g. \`Sentinel — AIR (ADS-B)\` |
| \`reserved_at\` | Unix ms the lease was taken |
| \`reserved_expires_at\` | Unix ms it lapses unless renewed |

New routes, all session-gated:

- \`POST /api/devices/{id}/reservation\` — acquire or renew. Body carries
  \`holder\`, \`label\`, \`ttl_seconds\`, and optionally the \`tuning\` to apply
  atomically with the claim. \`409 device_reserved\` when another holder's lease
  is live, naming the holder and its expiry.
- \`DELETE /api/devices/{id}/reservation\` — release. Idempotent.

**A lease has a TTL and must be renewed.** This is the single most important
property: without it, a closed browser tab, a crashed container or an unplugged
network cable would lock a dongle until someone found the row in the database.
Proposed 120 s lease, renewed every 30 s — four missed renewals before release,
which tolerates a poll or two being lost without holding the device for minutes
after its consumer has gone.

**Enforcement, not advice.** \`PATCH /api/devices/{id}\` rejects tuning changes
from anyone but the holder while a lease is live (\`409 device_reserved\`).
Sentry's own UI shows the holder and offers an explicit override — an operator
standing at the machine must always be able to take their own hardware back, but
should have to mean it.

\`GET /api/v1/sdrs\` gains \`reserved_by\`/\`reserved_until\` on each item, so a
*second* Sentinel can see a device is taken before trying to claim it. Additive,
so it needs no \`api_version\` bump.

Rejected: **locking by convention** (a notes field, or Sentinel simply not
retuning devices it thinks are busy). The failure this prevents is two consumers
disagreeing, and a lock only the polite participants respect prevents nothing.

Rejected: **permanent locks released only explicitly.** Every distributed
release path — tab closed, laptop asleep, container killed, network partitioned
— fails open into "locked forever".

### 3. The air source names a Sentry device, not just a URL

\`air.offgridDataSourceURL\` (the decoder's URL) is joined by
\`air.offgridSdrSource\`: \`{sentry_host_id, sentry_device_id}\`, chosen from a
picker in Settings → AIR that lists the devices Sentinel already knows about
from its Sentry hosts.

The decoder stops being told its source by environment variable and instead
polls \`GET /api/sdr/adsb/config\` for the \`rtl_tcp\` host and port — the pattern
the voice decoder already uses (\`CONFIG_URL\`). One fact, one place, and changing
the source device in the UI reconfigures the decoder without editing compose.

### 4. AIR claims on entry, renews while open, releases on leave

On entering AIR with effective mode \`offgrid\` and an \`offgridSdrSource\` set:

1. Acquire the reservation with the tuning applied atomically —
   \`center_hz: 1_090_000_000\`, \`sample_rate: 2_400_000\`, \`gain_auto: true\`.
2. Renew every 30 s while AIR is the active view.
3. Release on leaving AIR, and on page unload as a best effort; the TTL is what
   actually guarantees release, the explicit call only makes it prompt.

Tuning is applied **with** the claim rather than after it, so there is no window
in which the device is claimed but still on the wrong frequency, and no second
request that can fail on its own.

**Failures surface in the UI, they do not fail silently.** A 409 shows who holds
the device with an override; a 401 says the Sentry host needs its password
setting; an unreachable host says so. The current behaviour — an empty map — is
what this whole ADR exists to stop.

**The previous tuning is not restored on release.** Restoring it sounds tidy but
is the wrong default: an operator who watched AIR, left, and found their dongle
back on 162 MHz would rightly call that a bug, and the value is stale the moment
anyone else touches the device. Whoever wants a frequency claims it.

## Consequences

- Sentinel↔Sentry management calls start working for the first time against a
  protected Sentry. Everything already built on \`sentry_client\` — device
  records, patches, serial flash — is fixed by the same change.
- Sentry gains a concept it does not have: a device that is *busy*. Its UI must
  show it, and its config import must not stamp over a live lease.
- A dongle can serve exactly one tuned purpose at a time. That is physical
  reality, not a limitation introduced here, but it becomes visible: AIR and the
  voice decoder cannot share one dongle, and the UI must say so rather than
  letting them fight.
- The \`sdr_devices\` table needs a migration, and \`SdrExportItem\` grows two
  fields.

## Open questions

1. **Lease TTL and renewal interval** — 120 s / 30 s proposed. Shorter frees a
   dongle faster after a crash; longer tolerates a flakier network.
2. **Override semantics in Sentry's UI** — does taking a device from Sentinel
   notify Sentinel (it will discover the 409 on its next renewal), or is
   discovering it enough?
3. **Multiple receivers.** readsb accepts several feeds via \`--net-connector\`.
   If AIR is later fed by two dongles, the reservation becomes one-per-source
   and the config endpoint returns a list. Nothing here forecloses that, but it
   is not designed for yet.
`,An=`# 0004. Remove trunk tracking

Date: 2026-08-15
Status: accepted

## Context

Trunk tracking followed trunked-radio systems by their control channel: \`dsd-fme\`
decoded the control channel and, on each call grant, retuned to the assigned
voice channel and back. Sentinel shipped it as an opt-in feature behind a master
flag (\`sdr.trunkTrackingEnabled\`, default OFF).

Supporting it cost a vertical slice through every layer of the app, out of
proportion to a feature that was off by default:

- **A rigctld server in the backend** (\`backend/services/sdr_rigctl.py\`).
  \`dsd-fme\` drives retunes over Hamlib's rigctl protocol as the *client*, and
  normally the server is GQRX or SDR++. Sentinel's backend owns the single
  \`rtl_tcp\` connection and demodulates one channel for the decoder, so \`dsd-fme\`
  could not tune the hardware itself — the backend had to *be* the rigctld
  server, implementing the command subset \`dsd-fme\` sends and translating each
  requested frequency into either an in-span demod offset shift or a hardware
  retune.
- **A channel-map store** (\`backend/services/sdr_channel_maps.py\`) holding JSON
  in the database and rendering it to the CSV files \`dsd-fme\` loads, plus two
  route groups to edit and list them.
- **A localhost rigctl forwarder in the decoder container**, because \`dsd-fme\`'s
  rigctl client only ever dials \`localhost\` while the rigctld server lived in
  the app container.
- **A relaunch path**: \`dsd-fme\`'s trunking flags are fixed at launch, so
  toggling trunk mode had to bounce the decoder's PCM connection to force the
  sidecar to relaunch it (\`DigitalDecodeBridge.bounce_decoder()\`).
- **UI in three places**: the panel's TRUNK section, the decode dock's follow
  indicator, and two Settings rows (the master toggle plus a JSON channel-map
  editor gated behind it).

The feature also demanded per-system data Sentinel cannot obtain for the user:
DMR (Tier III / Capacity-Plus / Connect-Plus) and EDACS never transmit their
logical-channel → frequency mapping, so every user had to hand-build a channel
map before trunk tracking could work at all.

## Decision

Remove trunk tracking entirely, rather than keep it behind its flag.

Everything that existed only to serve it goes with it: the rigctld server and
channel-map service, the \`trunk_decode\` control-socket command, the
\`/api/sdr/data/channel-maps\` and \`/api/sdr/trunk/channel-maps\` routes, the
rigctl/channel-map settings, the decoder's \`-T/-U/-C/-G\` launch flags and rigctl
forwarder, the \`decoder/channel-maps\` mount, and the panel/dock/Settings UI.

\`GET /api/sdr/decode/config\` survives in reduced form — it now reports only
\`{"active": …}\`, which is what the sidecar supervisor gates dsd-fme launches on.

Three removals follow from the above rather than being separately motivated, and
are recorded here so a later reader does not read them as unrelated:

- \`DigitalDecodeBridge.bounce_decoder()\` and the \`connection\` /
  \`current_offset_hz\` accessors — the relaunch path and the values the rigctld
  server read.
- \`SettingsPanel\`'s \`isSettingVisible()\` — the channel-map editor was the only
  feature-flag-gated row.
- The \`settings-item--wide\` grid modifier and its CSS — that editor was its only
  user.

Digital voice decoding itself is untouched: conventional (non-trunked) P25, DMR,
NXDN, D-STAR and YSF decode exactly as before.

## Consequences

- **Breaking for API clients.** \`GET\`/\`POST /api/sdr/data/channel-maps\` and
  \`GET /api/sdr/trunk/channel-maps\` no longer exist, and the SDR control socket
  rejects \`trunk_decode\`.
- **Existing databases carry dead rows.** \`sdr.trunkTrackingEnabled\` and
  \`sdr.channel_maps\` are deleted on startup by \`prune_removed_settings()\` in
  \`backend/database.py\`, which is the pattern to extend when a later removal
  strands its own keys. The browser-side caches (\`sdrTrunkTrackingEnabled\`,
  \`sdrTrunkChannelMap\`) are cleared once in \`main.ts\` for the same reason.
- **Operators must update their compose overrides.** \`RIGCTL_HOST\`,
  \`RIGCTL_PORT\`, \`DECODER_RIGCTL_PORT\` and \`CHANNEL_MAPS_DIR\` are gone, as is
  the \`decoder/channel-maps\` volume; any existing CSVs are no longer read and
  can be deleted.
- **The decoder container gets simpler**: no forwarder thread, no socket
  plumbing, and a launch command that depends only on the environment.
- **Reinstating trunk tracking means rebuilding the rigctld server**, not
  flipping a flag back on. The design constraint that forced it — the backend
  owning the single \`rtl_tcp\` connection — has not changed, so this ADR's
  Context is the starting point if that is ever revisited.
- ADR-0002's B-series inventory references \`SdrTrunkSection\`, one of the five
  pickers that motivated \`BaseSelectMenu\`. That component no longer exists; see
  the amendment note in ADR-0002.
`,jn=`# 0005. Sea domain: live vessel tracking via AISStream

Date: 2026-09-12
Status: accepted

## Context

The Sea domain had been routing/settings scaffolding with an empty map. The
brief was to replicate the ship-tracking approach of
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) inside
Sentinel's existing structure and visual language, with the data source
configurable from Settings › SEA and a map that matches the Air and Space maps.

God's Eye View tracks ships with **AISStream.io** — a free, keyed AIS WebSocket
push feed that allows one connection per key and has no browser CORS — proxied
through a server-side module that keeps one long-lived socket, an in-memory
per-MMSI vessel store (30-minute retention, 50 000 cap, static-data merge,
thinned per-vessel track ring buffers) and a REST snapshot the client polls
every 60 s, with dead reckoning between polls and a slow reconnect watchdog.

## Decision

Build the Sea domain on the same model, translated into Sentinel's own
patterns rather than ported verbatim:

- **Backend feed, REST snapshot, polled map** — the Land/APRS delivery model.
  \`backend/services/ais_stream.py\` owns the single AISStream socket and its
  watchdog; \`backend/services/ais_store.py\` owns the vessel picture;
  \`backend/routers/sea.py\` serves \`GET /api/sea/vessels\` (viewport \`bbox\`,
  newest first, feed status attached), \`/vessels/{mmsi}/track\` and \`/status\`.
- **Watchdog cadence is deliberately asymmetric**: silence is *reported* after
  2 min so the map is honest, but the socket is only *recycled* at 2.5× that,
  and failures walk a 5 s → 15 s → 60 s → 5 min ladder before a 15-min DOWN
  cadence; a rejected key is probed hourly until the key changes. A reconnect
  storm is how the one-connection-per-key limit locks a feed out.
- **In-memory primary store, SQLite snapshot** — the AIS message rate rules out
  a write per message, but Sentinel is offline-capable, so the store is
  snapshotted to \`sea_vessel_cache\` every 30 s and reloaded on start, served
  as \`X-Cache: STALE\` until the feed is live again.
- **The key is a secret.** It lives in \`.env\` (\`AISSTREAM_API_KEY\`) or, taking
  precedence, in \`user_settings\` written only through \`PUT /api/sea/ais-key\`.
  The generic settings router redacts it on read, refuses it on write and
  skips it on config upload (\`_SECRET_SETTING_KEYS\`), so it never appears in
  an exported config.
- **Frontend mirrors Air**: \`SeaMap.vue\` (same style, connectivity restyle,
  shared controls), \`SeaSideMenu.vue\` (IconRail: zoom, locate, FILTER
  accordion of vessel families, MAP LAYERS accordion), \`SeaFilter.vue\` in the
  sidebar FILTER pane as the map's accessible data list, and
  \`AisVesselsControl\` extending \`SentinelControlBase\` — a MapLibre symbol
  layer of family-tinted hull chevrons, dead-reckoned at 1 Hz, Sentinel's
  shared label pills above zoom 9, bracket + recent-track on select.
- **Poll at 10 s, not 60 s**: the backend store is live, so a poll always has
  a chance of new fixes, and it matches the ADS-B cadence users already know.
  Every request carries the padded viewport bbox; a worldwide snapshot is
  tens of thousands of rows.
- **Colour by family** follows the source project's palette (tanker amber,
  cargo cyan, passenger pink, fishing green, service yellow) except military
  and SAR, which take Sentinel's \`#c8ff00\` so that lime means the same thing
  on every map.

## Consequences

- Live vessels need a free AISStream key. Without one the Sea map shows a
  notice with a shortcut to Settings › SEA; with one, terrestrial AIS coverage
  is coastal — mid-ocean is quiet by nature of the feed.
- Running two Sentinel backends (Docker and a local \`--reload\`) against the
  same key makes them fight for the connection; the slow ladder keeps that
  survivable but the README says not to.
- A worldwide subscription is hundreds of messages a second of JSON parsing
  in the Python process. Settings › SEA › Coverage Area limits it; the
  default stays worldwide for parity with the source project.
- \`AisVesselsControl\` pushes GeoJSON at most once a second and only when the
  source reports \`loaded()\`. A 250 ms cadence starved MapLibre's single
  worker so the base map never painted — keep the guard.
- The Off Grid slot (NMEA AIVDM over TCP/UDP from \`rtl_ais\` / AIS-catcher,
  decoded with \`pyais\` into the same store) is the planned follow-up; the
  reader reports \`unsupported-source\` for a non-\`wss://\` URL until then.
`,Mn=`# 0006. Sections as separate services behind a gateway

Date: 2026-10-13
Status: accepted

## Context

Until September 2026 Sentinel was one FastAPI process serving one Vue bundle.
Every section (Air, Space, Sea, Land, SDR) shared one SQLite file, one
settings router, one Pinia instance and one build, and sections imported each
other freely. That made a section impossible to leave out, upgrade or move on
its own. It also meant the radio code (rtl_tcp, Sentry, decode bridges) had to
run on the machine serving the browser, not the one next to the dongles.

The owner asked for an app/shell core plus one container per section: add or
remove a section by starting or stopping its container, run services on more
than one host, change nothing the user can see, and keep SDR audio playing while
the user moves between sections.

The full design, its review and the as-built notes for every phase are in
[\`docs/plans/section-containers.md\`](../plans/section-containers.md). This
record keeps the decisions and why they were made.

## Decision

**Core plus self-registering services.** Core is the \`app\` (shell UI, settings
and the live config file, notifications, offline maps, the service registry),
\`gateway\` (Caddy, the only origin browsers use) and \`nats\` (the event bus).
Space, Land, Air, Sea, SDR and the **radio hub** each run as their own service
from the same backend image (\`uvicorn sentinel_<id>.service:app\`, built by
\`create_service()\` in \`backend/platform/sdk/\`). A service registers its
manifest with core. Core pushes the service's path prefixes into the gateway,
and the shell loads its UI. No gateway or shell edit is needed to add a section.

- **Paths unchanged.** Every public API path, WebSocket protocol, settings key
  and the \`sentinel_config.json\` shape stayed byte-identical. The gateway routes
  by longest prefix (\`/api/sdr/radios\` → hub, \`/api/sdr/adsb/\` → Air, the rest
  of \`/api/sdr/\` → SDR), and parity goldens pin the route inventory and OpenAPI.
- **Runtime Module Federation for the UI.** Each section is a remote served
  under \`/remotes/<id>/\`, listed by \`GET /api/app/sections\`. A remote that fails
  to load gets a "section unavailable" page instead of breaking the shell. The
  SDR remote exposes an eager engine entry that the shell mounts outside the
  router view and never unloads, so audio survives navigation.
- **A database per service, settings in core.** Each service owns its tables
  in its own SQLite file and copies them out of the old \`sentinel.db\` on first
  boot (\`legacy_import.py\`). Settings stay central: services read and write them
  over core's settings API (\`backend/platform/settings_client.py\`).
- **Sections talk over the bus, never by import.** They use NATS core subjects
  (no JetStream) such as \`settings.changed.<ns>\`, \`decode.<kind>.<radioId>\` and
  \`hub.*\` request/reply. Publishing awaits local handlers first, then forwards
  to NATS. Import-linter contracts make "core imports no section" and "no
  section imports another" gating. FFT, IQ and PCM never go on the bus.
- **One radio hub owns every radio.** rtl_tcp and the Sentry fleet, the FFT
  broadcasters, tuning ownership, IQ capture and all decode bridges live in the
  hub. Decoder containers are thin wrappers that register a manifest. A new
  decoder kind needs no hub code, only an entry in the access table.
- **Secured by default, no configuration.** A one-shot \`service-credentials\`
  service generates a deployment CA, TLS-only NATS with a user per service and
  per-subject permissions (\`nats_permissions.py\`), and an HTTP credential per
  service and decoder. Core and the hub hold only hashes of those credentials.
  A checked-in table (\`service_access.py\`) says what each caller may do.
- **Multi-host.** The hub and decoders can run on a second machine
  (\`compose.radio-host.yaml\`, [\`docs/radio-host.md\`](../radio-host.md)). They
  reach core over TLS through a service entrypoint (:8443) and NATS, and PCM
  never crosses the LAN. \`docker buildx bake\` builds the image for amd64 and
  arm64. Decoder upstreams are pinned to commit SHAs.
- **Separate services are the only deployment mode** (2026-10-13, revising the
  plan's "keep \`dev-all\`"). Under compose, a bare \`docker compose up\` starts all
  six services. The app's \`SENTINEL_EXTERNAL_SERVICES\` is fixed to all six, so
  it never hosts a section itself. A section is left out with \`--scale
  <service>=0\`. A radio-host core sets \`SENTINEL_RADIO_REPLICAS=0\`.
- **Core never hosts a section** (P8, 2026-10-14). \`create_core_app()\`
  (\`backend/core/app.py\`) builds core only, and all of \`backend\` is barred from
  importing a section by import-linter. \`SENTINEL_EXTERNAL_SERVICES\` is gone, as
  is the non-Docker \`uvicorn backend.main:app\` dev loop: \`docker compose up\`
  (with live reload) is the only way to run Sentinel. The radio hub always
  stages IQ captures for the SDR section to collect over HTTP. Only the backend
  test suite still composes every section in one process
  (\`tests/in_process_app.py\`), so the route-order and OpenAPI goldens keep
  pinning the whole API.

## Consequences

- **Sections are optional and independent.** Stopping one greys its nav entry
  and its paths answer a JSON 503 (\`<id> is unavailable\`), while the rest keep
  working. Each can be upgraded, restarted or moved on its own, and the radio
  stack can sit next to the antennas.
- **More processes and more memory.** That's about 60–90 MB per Python service,
  roughly 1 GB with everything and all decoders on. The all-in-one mode is no
  longer offered for low-RAM hosts. Leaving sections out is the lever.
- **Core is a single point of failure for the UI** (accepted). Sections keep
  ingesting headless while it restarts.
- **Contracts to maintain.** A new bus subject must be added to the NATS
  permission table, and a new service or decoder to the access table plus its
  compose credential mount, or it is refused. The route-order and OpenAPI
  goldens fail on any accidental path change.
- **No non-Docker dev loop.** Running Sentinel needs Docker (compose brings
  NATS, the gateway and the credentials the services authenticate with). The
  backend tests need neither: they run every section in one process.
- **Not done from the plan:** \`frontend/spa-dist/\` is still committed. Images
  build the SPA themselves, but the volume-mounted dev/live flow and the SPA e2e
  suite serve the committed bundle.
`,Nn='# Event bus and security\n\nSections never import each other: they talk over the event bus (`backend/platform/bus.py`, carried by NATS) and HTTP. Every service proves who it is with its own credential.\n\n## Event bus\n\n- `publish(subject, payload)`: every local handler runs and is awaited, then it goes to NATS.\n- `subscribe(pattern, handler)`: `*` matches one part, `>` the rest.\n- `request(subject, payload)`: a local responder answers, else it crosses NATS and replies on `_INBOX.<user>`.\n\n*Figure: A publish runs local handlers first, then reaches other processes through NATS.*\n\n```mermaid\nflowchart TB\n    pub["radio: publish<br/>decode.aprs.3"] --> local["local handlers"]\n    pub --> nats(("NATS"))\n    nats --> land["land: decode.aprs.*"]\n    req["sea: request<br/>hub.decode.ais.start"] --> nats\n    nats --> resp["radio: responder"]\n    resp -- "reply on _INBOX.sea" --> nats\n```\n\nRules:\n\n- **Low-rate control events only.** Never FFT, IQ or PCM.\n- Payloads are JSON; the `db` session is stripped and re-injected, so handlers keep their signature.\n- A remote exception arrives as `RemoteHandlerError`.\n- `no_echo` is on: local handlers already ran. Removing it handles every event twice.\n- A missing broker never blocks start-up or a publish.\n\n| Subject | From | Means |\n|---|---|---|\n| `settings.changed.<ns>` | core | A setting changed |\n| `registry.changed` | core | A service came, went, or changed availability |\n| `notifications.raise` | a section | Store and push an alert |\n| `decode.<kind>.<radioId>` | radio hub | A decoder heard something |\n| `hub.decode.<kind>.{start,stop,status}` | a section | Control a decoder |\n| `hub.sentry.…` | air | Reserve a Sentry dongle, receiver location |\n| `hub.iq-capture.{locate,list,discard}` | sdr | IQ capture hand-over |\n| `air.squawk.changed` | air | A squawk changed |\n\n**Adding a subject:** add it to the user\'s row in `backend/platform/nats_permissions.py`, `docker compose up -d`, then `docker compose restart nats`. Otherwise the broker refuses it (`permissions violation`).\n\n## Security\n\nNo user logins: anyone who reaches :8080 can use Sentinel, so keep it on a trusted network.\n\n| Crossing | Protected by |\n|---|---|\n| Browser → gateway | Your network; `/internal/…` refused |\n| Service → core internal routes | Its own token, `Authorization: Bearer` |\n| Decoder → radio hub | Its own token, `X-Decode-Secret` |\n| Anything → NATS | TLS with the install\'s own CA, one NATS user each |\n| Radio host → core | TLS on :8443 and :4222, plus its own credentials |\n\n- `service-credentials` creates, on every `up` and only what is missing: a CA, TLS certs, per-caller tokens and NATS logins, and `accepted-callers.json` for core and the hub holding only **SHA-256 hashes**.\n- Each container mounts only `credentials/<caller>/`. To replace one, delete its folder and `docker compose up -d`.\n- `backend/platform/service_access.py` says what each caller may do: register itself; `sea` reads the AISStream key; `sdr` fetches IQ captures; decoders act as their own kind only.\n- Guards (`backend/core/internal_auth.py`): 503 no caller list, 401 unknown token, 403 not allowed.\n- **A new service or decoder kind** needs a row in both tables and a credentials mount.\n\nIn the browser:\n\n- Core sets the CSP on `index.html` (`backend/core/spa_csp.py`), allowing its inline boot scripts by hash. It keeps `blob:` and `\'unsafe-eval\'` for SDR audio.\n- Remotes load only from same-origin `/remotes/<id>/`.\n- Docs render with markdown-it (`html: false`) then DOMPurify; Mermaid runs `securityLevel: strict`.\n\nEvery route validates input at the edge (Pydantic, bounds, allow-lists); queries go through SQLAlchemy. Add a test proving bad input is refused.\n',Pn=`# Data flows

Each section's data from source to map, with the **ONLINE** and **OFF GRID** paths drawn apart. Which one is live: the section's **Source Override**, else **Connectivity Mode** (\`resolve_effective_mode\`, \`resolve_domain_urls\` in \`backend/utils.py\`).

## Air

*Figure: Aircraft from adsb.lol online or your own receiver off grid, through Air's cache, to the map and to emergency alerts.*

\`\`\`mermaid
flowchart TB
    subgraph airOnline["ONLINE"]
        adsblol["adsb.lol"]
    end
    subgraph airOffgrid["OFF GRID"]
        sentry["Sentry dongle<br/>1090 MHz"] --> readsb["adsb-decoder<br/>readsb"]
    end
    adsblol --> router["air: router<br/>+ SQLite cache"]
    readsb --> router
    router --> map["AIR map"]
    router --> tracker["SquawkTracker"]
    tracker -- "notifications.raise" --> core["core: alerts over SSE"]
    class airOnline online
    class airOffgrid offgrid
\`\`\`

- The map asks Air for aircraft within 250 nm of its centre every few seconds; Air answers from cache or the live source ([Storage](storage.md#caching)).
- Off grid, opening Air reserves the Sentry dongle through the hub and tunes it to 1090 MHz. readsb reads IQ directly; the decoder finds its dongle via \`/api/sdr/adsb/config\`.
- Every snapshot feeds the \`SquawkTracker\`. With no map open, \`AdsbWatcher\` fetches on its own interval, so emergencies are still caught. The map only highlights; it never raises the alert.

## Space

*Figure: TLEs from CelesTrak online or a stored or uploaded copy off grid, propagated with SGP4.*

\`\`\`mermaid
flowchart TB
    subgraph spaceOnline["ONLINE"]
        celestrak["CelesTrak"]
    end
    subgraph spaceOffgrid["OFF GRID"]
        stored["Stored TLEs<br/>or a .txt upload"]
    end
    celestrak --> tle["space.db: TLEs"]
    stored --> tle
    tle --> sgp4["SGP4"]
    sgp4 --> map["SPACE map:<br/>positions, tracks, footprints"]
    sgp4 --> passes["passes"]
    passes --> sched["browser: pass scheduler"]
    sched --> tune["alert, auto-tune, record"]
    class spaceOnline online
    class spaceOffgrid offgrid
\`\`\`

- SGP4 runs in the Space service, so positions and passes need no internet once TLEs are stored.
- The pass scheduler runs in the browser: alerts and auto-tune need a tab open.

## Sea

*Figure: AISStream online or the AIS decoder off grid, both feeding one vessel store.*

\`\`\`mermaid
flowchart TB
    subgraph seaOnline["ONLINE"]
        aisstream["AISStream WebSocket<br/>one per key"]
    end
    subgraph seaOffgrid["OFF GRID"]
        dongle["Dongle 161.975 /<br/>162.025 MHz"] --> hub["radio hub<br/>stereo PCM"] --> dec["ais-decoder"]
        dec -- "decode.ais.*" --> adapter["ais_decode:<br/>AISStream-shaped envelope"]
    end
    aisstream --> store["AisVesselStore<br/>by MMSI"]
    adapter --> store
    store --> snap["sea_vessel_cache<br/>every 30 s"]
    store --> map["SEA map ≤ 1 update/s"]
    class seaOnline online
    class seaOffgrid offgrid
\`\`\`

- Both sources feed **one** store, so tracks, types and the cache are identical either way. Don't add a second ingest path.
- Off grid, never start the AISStream reader: it burns the reconnect ladder.
- Online, a watchdog reports silence after 2 minutes but reconnects slowly. Don't speed it up: a reconnect storm locks the key out.
- The map pushes to MapLibre at most once a second, and only when the source has loaded.

## Land

*Figure: Repeaters from a daily download online or the built-in copy off grid; APRS always from your radio.*

\`\`\`mermaid
flowchart TB
    subgraph landOnline["ONLINE"]
        ukr["ukrepeater.net<br/>daily"]
    end
    subgraph landOffgrid["OFF GRID"]
        bundled["uk_repeaters.json<br/>built in"]
        aprs["APRS dongle → radio hub<br/>→ aprs-decoder"]
    end
    ukr --> cache["land.db:<br/>repeater_cache"]
    bundled -. "fallback" .-> cache
    aprs -- "decode.aprs.*" --> stations["land.db:<br/>APRS stations"]
    cache --> map["LAND map"]
    stations --> map
    class landOnline online
    class landOffgrid offgrid
\`\`\`

- \`backend/scripts/refresh_repeaters.py\` regenerates the built-in copy.
- A cleanup loop deletes old stations at start and every 24 h.

## SDR

Always your own radios. Live data goes through the radio hub ([Radios and decoding](radios.md)); saved frequencies, groups, ranges and recordings through the SDR service to \`sdr.db\`.

## Maps

*Figure: Online tiles from the internet; off grid from downloaded areas, then the base archive.*

\`\`\`mermaid
flowchart TB
    subgraph mapOnline["ONLINE"]
        web["Online tile source"]
    end
    subgraph mapOffgrid["OFF GRID"]
        regions["Downloaded areas<br/>newest first"] --> base["Base archive<br/>frontend/assets/tiles"] --> none["204: blank"]
    end
    web --> map["Every map"]
    regions --> map
    base --> map
    class mapOnline online
    class mapOffgrid offgrid
\`\`\`

Off grid, tiles come from core's \`/api/offline-map/{basemap,terrain}/{z}/{x}/{y}\` ([Storage](storage.md#offline-map-tiles)).
`,Fn=`# How it works

A small **core** plus **one service per section**, all from one backend image, with a Vue app (the **shell**) in the browser. Decisions behind it: [ADR 0006](../adr/0006-section-containers.md).

## The parts

- **Core** (\`app\`, \`backend/\`): settings, alerts, offline maps, the service registry; serves the shell.
- **Sections** (\`air\`, \`space\`, \`sea\`, \`land\`, \`sdr\`): each its own FastAPI service, SQLite database and UI remote.
- **Radio hub** (\`radio\`): everything that touches a physical radio.
- **Gateway** (Caddy): the only address a browser uses.
- **NATS**: low-rate events between services.
- **Decoders**: optional containers that turn radio audio into data.

*Figure: The browser reaches the services only through the gateway. Online feeds flow into the services; off grid, your dongles feed the radio hub, which trades audio and decoded events with the decoders.*

\`\`\`mermaid
flowchart TB
    browser["Browser<br/>shell + remotes"] --> gateway["gateway :8080"]
    gateway --> services
    subgraph services["SERVICES"]
        app["app (core)"]
        sections["air · space · sea · land · sdr"]
        radio["radio hub"]
        nats["nats<br/>events between services"]
    end
    subgraph onlineFeeds["ONLINE"]
        feeds["adsb.lol · AISStream<br/>CelesTrak · ukrepeater.net<br/>Protomaps"]
    end
    onlineFeeds --> services
    subgraph offgridRadios["OFF GRID"]
        dongles["RTL-SDR dongles<br/>rtl_tcp / Sentry"]
        decoders["decoders<br/>voice · aprs · ais · adsb"]
    end
    dongles -- "IQ samples" --> radio
    radio <-- "audio out,<br/>events back" --> decoders
    class onlineFeeds online
    class offgridRadios offgrid
\`\`\`

- The browser reaches only the gateway, over HTTP, SSE and WebSockets.
- Services register with core and read settings over HTTP; events go over NATS.
- Online, sections and core fetch internet feeds. Off grid, data comes from your dongles through the radio hub and decoders.

## Start-up

1. \`service-credentials\` runs once: certificates and a login per service.
2. \`nats\`, then \`app\`, then the gateway and every section and the hub.
3. Each section waits for core (\`waiting for core to answer\`), connects to NATS, runs \`prepare\` (tables, first-boot import) and \`start\` (background work).
4. It registers its **manifest** (id, address, path prefixes) with core.
5. Core pushes the routes into Caddy, and health-probes the service every 10 s.

Three failed probes mark it unavailable: its route answers 503 and the shell greys it out. The registry is in memory; services re-register, so a restarted core relearns them in seconds.

## Routing

Core keeps the gateway's routes in step through Caddy's admin API (:2019, compose network only): at once on a registration, and every 10 s, so a restarted gateway heals itself. Longest prefix wins:

| Path | Goes to |
|---|---|
| \`/api/air/messages…\` | core (alerts) |
| \`/api/air/…\`, \`/api/sdr/adsb/…\` | air |
| \`/api/sdr/radios\`, \`/connect\`, \`/decode/…\`, \`/aprs/…\`, \`/ais/…\`, \`/sentry-hosts\`, \`/decoders\`, \`/ws/sdr/…\` | radio |
| \`/api/sdr/…\` | sdr |
| \`/api/<id>/…\`, \`/remotes/<id>/…\` | that section |
| anything else | core |

- \`/internal/…\` always gets a 404 from the gateway.
- Caddy streams SSE and WebSockets as is: don't add buffering.
- :8443 is a TLS entrypoint straight to core, for a [radio host](../radio-host.md).

## In Docker

- One image (\`backend/Dockerfile\`) for every Python service; only the \`uvicorn\` target differs.
- Its stages: build the SPA and docs (Node), fetch \`pmtiles\` (checksummed), then the Python runtime as an unprivileged user.
- Backend code is bind-mounted with \`uvicorn --reload\`; the built \`frontend/spa-dist/\` is mounted read-only.
- Every service has its own volume ([Storage](storage.md)).

## More

- [Data flows](data-flows.md): each section, online and off grid
- [Radios and decoding](radios.md)
- [Storage and caching](storage.md)
- [Event bus and security](bus-and-security.md)
- [Code map](../development/code-map.md)
`,In=`# Radios and decoding

From the dongle to the waterfall, the speakers, a recording and a decoder. Code: the radio hub (\`services/radio/backend/sentinel_radio/\`) and the SDR frontend (\`services/sections/sdr/frontend/\`).

## Dongle to screen and speakers

*Figure: One radio's samples: one reader in the hub, spectrum frames and raw IQ to the browser.*

\`\`\`mermaid
flowchart TB
    dongle["RTL-SDR"] --> rtl["rtl_tcp"]
    rtl -- "TCP: IQ" --> bc["radio hub:<br/>one broadcaster per radio"]
    bc --> fft["FFT every ~40 ms"]
    fft -- "/ws/sdr/{id}" --> wf["Browser: spectrum + waterfall"]
    bc -- "/ws/sdr/{id}/iq" --> worklet["Browser audio worklet:<br/>shift, filter, demodulate"]
    worklet --> speakers["Speakers"]
    wf -- "tune, gain, rate" --> bc
    bc -- "5-byte commands" --> rtl
\`\`\`

- **One broadcaster task per radio** reads the TCP stream and fans out to every subscriber. Several readers on one socket would fail.
- Reads are sized **by time** (~40 ms, ~25 fps), so the frame rate holds when the sample rate changes. FFT size 1024–32768.
- \`rtl_tcp\` commands are 5 bytes: command byte plus a big-endian uint32.
- The browser demodulates (NFM, WFM, AM, USB, LSB, CW). The worklet's channel filter must always run, or the whole band plays.
- The SDR engine is mounted outside the page, so audio survives navigation.
- Two more sockets: \`/ws/sdr/{id}/decode\` (events, logs) and \`/decode/audio\` (decoded voice).

**Sentry:** the hub uses Sentry's HTTP API to list, claim, tune and release dongles, then streams IQ from that dongle's \`rtl_tcp\` port. Sentry hosts live in \`radio.db\`; radios are core's \`sdr.radios\` setting. Design: [ADR 0003](../adr/0003-sentry-sdr-lock-and-tune.md).

## Recordings

- The browser records the WAV (it has the audio, only while squelch is open); the hub captures IQ (it has the samples).
- On stop the browser uploads the WAV; the SDR service then fetches the \`.u8\` from the hub's \`/internal/radio-hub/iq-captures/<id>\` (only SDR's credential may) and clears **COPYING IQ…**.
- A 60 s reconcile loop retries copies, stops stray captures and discards uncollected ones. No shared volume, so the hub can run elsewhere.
- Always build paths with \`sentinel_sdr.services.recording_folders\`; each recording stores its own folder.

## Decoders

The hub demodulates and serves decoders **audio**, like a scanner's speaker output; decoders never touch the dongle.

| Decoder | Program | Hub port | Audio |
|---|---|---|---|
| Voice | dsd-fme | 7355 (+7356 UDP back) | 48 kHz mono |
| APRS | Direwolf | 7357 | 48 kHz mono |
| AIS | Direwolf 1.8 | 7358 | 48 kHz stereo: A left, B right |
| ADS-B | readsb | — | Reads Sentry IQ directly, serves JSON |

*Figure: An APRS decoder from start-up to a station on the Land map.*

\`\`\`mermaid
sequenceDiagram
    participant Dec as aprs-decoder
    participant Hub as radio hub
    participant Land as land
    Dec->>Hub: GET /api/sdr/aprs/config (X-Decode-Secret)
    Hub-->>Dec: radio, pcmFeed host:port
    Dec->>Hub: connect to pcmFeed
    Hub->>Dec: 48 kHz PCM
    Dec->>Hub: POST /api/sdr/aprs/ingest
    Hub->>Land: decode.aprs.<radioId> (NATS)
\`\`\`

- Decoders reach the hub through the gateway and learn the PCM socket from \`/config\`, so nothing hard-codes where the hub runs.
- **APRS and AIS own an absolute channel**: they tune on start, demodulate at the offset for each chunk's real capture frequency, and pull the radio back after ~15 s if moved.
- AIS decodes both channels 50 kHz apart as stereo; one channel loses half the traffic.

## A new decoder kind

No hub code. The container registers a manifest (\`POST /api/sdr/decoders/register\`): kind, channels, whether it owns them. The hub runs a generic bridge (\`manifest_decode.py\`) and publishes \`decode.<kind>.<radioId>\`. A 404 on \`/config\` means the hub restarted: register again.

You still add: a row in \`service_access.py\` plus a compose mount of \`credentials/<kind>-decoder/\`, and a subscriber with its subject in \`nats_permissions.py\`. Template: \`decoder/stub/\`, tested in CI by \`tests/backend/test_decoder_stub_contract.py\`.
`,Ln="# Storage and caching\n\nEvery service owns its own SQLite database; only settings are shared, and they belong to core.\n\n## Who owns what\n\n| Store | Owner | Holds |\n|---|---|---|\n| `sentinel.db` (`sentinel_db`) | core | `user_settings` (every setting, incl. `sdr.radios`), alerts, offline map areas |\n| `tiles/` beside it | core | Downloaded `.pmtiles` |\n| `backend/data/sentinel_config.json` | core | Live two-way copy of every setting |\n| `space.db` | space | Satellites and TLEs |\n| `air.db` | air | ADS-B snapshot cache, tracked aircraft |\n| `sea.db` | sea | `sea_vessel_cache` (30 s snapshot), `sea_vessel_static` |\n| `land.db` | land | APRS stations, `repeater_cache` |\n| `sdr.db` + recordings | sdr | Frequencies, groups, ranges, recordings |\n| `radio.db` | radio | Sentry hosts |\n| Memory | each | Service registry (core), live vessels (sea), radio connections (radio) |\n\n- Async SQLAlchemy 2.0 on aiosqlite; every connection sets `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`.\n- No service opens another's file. Sections read settings through the **settings client** (HTTP to core), never `user_settings`.\n- To look inside: `docker compose cp sea:/app/data/sea.db ./sea.db`. Stop a service before editing its file by hand.\n\n## Schema changes\n\nNo migration files. On every start, a service's `prepare`:\n\n1. `create_all` for its tables.\n2. `ALTER TABLE … ADD COLUMN` for each column added since (already there: ignored).\n3. Backfills empty new columns.\n4. First boot only: copies its tables from the old `sentinel.db` (`/legacy`, read-only).\n5. Seeds starting data where none exists.\n\n- **New column:** add it to the model **and** to the section's added-columns list, or old installs never get it.\n- **Rename / remove:** add a new column; stop using the old.\n- **Test** against a database from the previous version.\n\nSeed data: `backend/default_config.json` (every setting; add new ones here), `backend/data/sdr_frequencies.json`, `sdr_bandplan.json`, `satellite_radio.json`, `uk_repeaters.json`.\n\n## A settings change\n\n*Figure: From APPLY CHANGES to every service and browser using the new value.*\n\n```mermaid\nsequenceDiagram\n    participant UI as Settings page\n    participant Core as core\n    participant Bus as NATS\n    participant Sea as sea\n    UI->>Core: PUT /api/settings/sea/…\n    Core->>Core: write user_settings,<br/>rewrite config file\n    Core->>Bus: settings.changed.sea\n    Bus->>Sea: settings.changed.sea\n    Sea->>Core: read new value\n    UI->>Core: GET /api/settings\n    UI->>UI: apply in place,<br/>sentinel:config-uploaded\n```\n\n- Controls **stage** until **APPLY CHANGES**.\n- The browser applies settings in place: anything that reads a setting once must re-read on `sentinel:config-uploaded`.\n- Core polls the config file every second (inotify doesn't cross Docker Desktop mounts) and applies a valid edit like an upload.\n- Secrets (the AISStream key) never reach the public API, the file or exports.\n\n## Caching\n\nFresh window: serve the cache. Past it: fetch. Fetch failed: serve a copy inside the stale window. Helpers in `backend/cache.py`.\n\n| What | Fresh / stale |\n|---|---|\n| ADS-B | 10 s / 60 s (`ADSB_TTL_MS`, `ADSB_STALE_MS`) |\n| TLEs | 6 h / 12 h; uploads 30 days |\n| UK repeaters | daily; stale up to 30 days, then the built-in copy |\n| Vessels | 30 min retention; snapshot every 30 s |\n\nWindows are in `backend/config.py`; override them in `docker-compose.override.yml` ([how](../configuration.md#anything-else)).\n\nAir's `X-Cache` header: `HIT`, `MISS`, `BYPASS` (cache write failed), `NEARBY` (nearest recent point), `STALE`, `RATED` (upstream 429), `THROTTLED` (own limiter), `FALLBACK` (other mode's source). `X-Snapshot-Age-Ms` lets the map place aircraft where they are now.\n\n## Offline map tiles\n\n- `/api/offline-map/{basemap,terrain}/{z}/{x}/{y}`: downloaded areas newest first, then the base archive, then 204.\n- Readers are cached across requests (`tile_tier_resolver.py`).\n- A finished download bumps `tiers_version`; maps call `setTiles()` with `?v=`. Never `map.setStyle()`: it won't refetch, and wipes overlays.\n",Rn="# Environment variables (.env)\n\n`.env` holds how Sentinel runs on this computer: what starts, where files go, and a second computer. Everything else is in [Settings](use/settings.md). You don't need one: every variable has a default.\n\n- `cp .env.example .env` gives you every variable set to its default, with a comment on each; change only what differs. The three radio-host URLs stay commented out.\n- After a change: `docker compose up -d` (restarts only what the change affects).\n- Never commit it.\n\n## What starts\n\n| Variable | Default | Set it to |\n|---|---|---|\n| `COMPOSE_PROFILES` | none | Decoders to start every time: `all`, or a list such as `aprs,ais` |\n| `SENTINEL_RADIO_REPLICAS` | `1` | `0` when the radio hub runs on [a second computer](radio-host.md) |\n\n## Where files go\n\n| Variable | Default | Set it to |\n|---|---|---|\n| `SENTINEL_RECORDINGS_DIRECTORY` | `sdr_recordings` volume | A folder for recordings, such as `~/SentinelRecordings` |\n| `SENTINEL_RUNTIME_USER_ID` / `_GROUP_ID` | `1000` / `1000` | Your ids on Linux (`id -u`, `id -g`) if they aren't 1000 |\n\n## Data sources\n\n| Variable | Default | Set it to |\n|---|---|---|\n| `AISSTREAM_API_KEY` | empty | Your AISStream key, instead of typing it in Settings (Settings wins) |\n| `ADSB_OFFGRID_URL` | the `adsb-decoder` container | An ADS-B decoder elsewhere: `http://<host>:8090/data/aircraft.json` |\n| `OFFLINE_BASEMAP_SOURCE_URL` | newest Protomaps build | A fixed or self-hosted basemap archive |\n| `OFFLINE_TERRAIN_SOURCE_URL` | Mapterhorn | Another Terrarium-format terrain archive |\n\n## ADS-B decoder\n\n| Variable | Default | Set it to |\n|---|---|---|\n| `SENTINEL_ADSB_SENTRY_API` | empty (no check) | Your Sentry host, `http://<sentry-host>:8000`, to log what the dongle is tuned to |\n| `SENTINEL_ADSB_DECODER_ADDRESS` | `127.0.0.1:8090` | `0.0.0.0:8090` to let another computer read it (no password) |\n| `SENTINEL_ADSB_RTL_TCP_HOST` / `_PORT` | empty / `2345` | A fixed dongle, before one is picked in Settings |\n| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | `http://<sentinel-host>:8080` for a decoder outside this Docker |\n\n## A second computer\n\n`SENTINEL_CORE_HOSTNAMES`, `SENTINEL_RADIO_HOST_HOSTNAMES`, `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS`, `NATS_PUBLISHED_ADDRESS`, and on the radio host `SENTINEL_CORE_ENTRYPOINT_URL`, `SENTINEL_CORE_NATS_URL`, `SENTINEL_RADIO_HOST_URL`, `SENTINEL_RADIO_HOST_GATEWAY_ADDRESS`. Values and where each goes: [Radio host](radio-host.md).\n\n## Leave alone\n\n`NATS_URL` and `GATEWAY_ADMIN_URL` connect Sentinel's own containers.\n\n## Anything else\n\nOther backend settings (cache times, timeouts, ports; see `backend/config.py`) do nothing in `.env`. Set them on the service in `docker-compose.override.yml` (Compose reads it automatically; Git ignores it):\n\n```yaml\nservices:\n  air:\n    environment:\n      ADSB_TTL_MS: \"5000\"\n```\n\nThen `docker compose up -d`. Check with `docker compose config air`.\n\n## Example\n\n```bash\nCOMPOSE_PROFILES=all\nSENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings\nSENTINEL_ADSB_SENTRY_API=http://192.168.1.20:8000\n```\n",zn=`# Decoders

Optional containers that turn a radio signal into data. Each runs in its own compose profile and needs its own dongle. Using them: [Decode](use/sdr/decode.md).

| Decoder | Profile | Gives | Program |
|---|---|---|---|
| Digital voice | \`voice-decoder\` | DMR, P25, NXDN, D-STAR, YSF, M17 in the SDR panel | dsd-fme |
| APRS | \`aprs\` | Stations on the Land map | Direwolf |
| AIS | \`ais\` | Ships on the Sea map, no internet | Direwolf 1.8 |
| ADS-B | \`adsb\` | Aircraft on the Air map, no internet | readsb |

## Start

\`\`\`bash
docker compose --profile all up -d --build                 # every decoder
docker compose --profile aprs --profile ais up -d --build  # some
\`\`\`

The first build takes several minutes. Then give each its radio in Settings (**Off Grid … SDR** for Air, Sea and Land; the **DMR** button for voice).

A healthy decoder logs \`[aprs] connected to the radio hub through http://gateway:8080\`.

## Everyday

\`\`\`bash
COMPOSE_PROFILES=aprs,ais                                  # in .env: start them every time
docker compose up -d --build --no-deps aprs-decoder        # rebuild one, leave the rest running
docker compose stop aprs-decoder                           # stop one
\`\`\`

## On another computer

The radio hub and the voice, APRS and AIS decoders can run by the antennas: [Radio host](radio-host.md). ADS-B stays on the main computer. A decoder outside Docker needs \`SENTINEL_GATEWAY_URL\`.

## If it's not working

| You see | Do |
|---|---|
| \`waiting for the radio hub\` repeats | \`docker compose ps radio\` |
| \`decode-config fetch failed: HTTP Error 401\` | \`docker compose restart <decoder>\` |
| ADS-B: \`no ADS-B source configured\` | Pick the dongle again in **Off Grid ADS-B SDR** |
| A radio reads **RESERVED** | On purpose: a decoder holds it |

## For developers

Each decoder's README: [\`decoder/README.md\`](../decoder/README.md) (voice), [\`aprs\`](../decoder/aprs/README.md), [\`ais\`](../decoder/ais/README.md), [\`adsb\`](../decoder/adsb/README.md). Never push decoder images to a public registry: the voice image includes the patent-encumbered mbelib.
`,Bn="# Code map\n\nWhere things are, and the rules about who may import whom.\n\n## Where to change…\n\n| To change | Go to |\n|---|---|\n| A section in the browser | `services/sections/<id>/frontend/src/` |\n| A map feature | `…/frontend/src/controls/<feature>/`, or `platform/web/map-kit/src/controls/` if shared |\n| A section's API or background work | `services/sections/<id>/backend/sentinel_<id>/` |\n| Anything touching a radio | `services/radio/backend/sentinel_radio/` |\n| Settings storage, config file, alerts, offline maps | `backend/core/`, `backend/routers/`, `backend/services/` |\n| The page frame, Settings, Docs | `frontend/vue/src/` |\n| A shared button, field or panel | `platform/web/ui/src/` |\n| A setting's default | `backend/default_config.json` |\n| Containers, ports, volumes | `docker-compose.yml` |\n| A decoder | `decoder/<kind>/` |\n| These docs | `docs/`, menu in `docs/nav.json` |\n\n## Backend\n\n| Package | Holds |\n|---|---|\n| `backend.core` | Core only: app factory, registry, gateway sync, alerts, internal auth, SPA serving |\n| `backend.platform` | Shared: event bus, lifecycles, service SDK (`create_service()`), settings client, credentials |\n| `backend.routers`, `backend.services` | Core's settings and offline-map routes and work |\n| `sentinel_<id>` | A section: `router`, `services/`, `models`, `database`, `module` (lifecycle + manifest), `service`, `tests/` |\n| `sentinel_radio` | The radio hub, same layout |\n\n- **Nothing in `backend` imports a section**; core never even loads their code (`tests/backend/test_core_entry_point.py`). No section imports another. import-linter gates both.\n- Only `tests/in_process_app.py` imports everything, for the backend tests.\n- Core's entry is `backend/main.py` → `create_core_app()`. Every browser file must sit under one of its mounts (`/assets`, `/spa-assets`, `/fonts`, `/remotes`); anything else falls through to `index.html`.\n- **Lifecycles:** every `prepare` runs before any `start`; `stop` in reverse; `wake` on SIGTERM first. Don't remove the wake chain: long-lived sockets deadlock `--reload` without it.\n\n## Frontend\n\n| Package | Holds |\n|---|---|\n| shell (`frontend/vue/`) | App, router, menu, sidebar, footer, Settings, Docs, section loading |\n| `@sentinel/ui` | `Base*` components, icon rail, overlays. Depends only on Vue |\n| `@sentinel/shell-api` | Registries, capabilities, shared stores, the settings kit |\n| `@sentinel/map-kit` | `MapLibreMap.vue`, `SentinelControlBase`, shared controls |\n| `@sentinel/web-config` | Shared TS, ESLint, Prettier, Vitest config |\n| `@sentinel/section-<id>` | One section's UI and `src/section.ts` |\n\n- Direction: `ui` ← `shell-api` ← `map-kit` ← sections ← shell. A section never imports another or the shell (`noSectionImports`). Only `frontend/vue/src/shell/sections.ts` imports sections.\n- Packages use relative imports, never `@/`.\n- **Boot:** fetch settings and `/api/app/sections`, load each remote (`/remotes/<id>/remoteEntry.js`), call each `register()`, apply settings, start the SDR engine, mount. A failed remote gets a stand-in; the rest carry on.\n- **Dev and tests** import sections directly (no federation); the production build swaps in `sections.federated.ts`.\n- A section plugs in through `sectionRegistry`, `settingsRegistry`, `settingsHydration`, `sidebarRegistry`, `footerRegistry`, `notificationRegistry`, `backgroundServices`, and capabilities (`radio`, `radioSites`).\n- State that must survive a remount (open pane, tab) belongs in a store.\n- Every map feature is a `SentinelControlBase` control, and every map has a **FILTER** list as its accessible equivalent.\n\n## Top level\n\n`backend/`, `services/`, `frontend/vue/`, `frontend/spa-dist/` (built, **committed**), `frontend/assets/` (tiles, sprites, fonts), `platform/web/`, `decoder/`, `gateway/`, `tests/` (backend and full-stack e2e), `scripts/`, `docs/` (`docs/plans/` isn't shown in the app), `.github/workflows/`, `docker-compose.yml`, `compose.radio-host.yaml`, `docker-bake.hcl`. `CHANGELOG.md` is generated: don't edit it.\n",Vn="# How to…\n\nRecipes for the usual changes. Tests and checks: [Testing](testing.md).\n\n## Add a setting\n\n1. Default in `backend/default_config.json`, under its namespace.\n2. Row in the section's `frontend/src/settings.ts` (`registerSettingItems`: `label`, `desc`, `searchTerms`, `control`).\n3. Control from `@sentinel/shell-api/settings/` that **stages** until **APPLY CHANGES**.\n4. Apply it to state with `registerSettingsHydrator` in `section.ts`.\n5. Re-read on `sentinel:config-uploaded` wherever it is read once.\n6. Backend: read through the settings client, never `user_settings`.\n7. A secret: add it to `SECRET_SETTING_KEYS` (`backend/services/app_config.py`) and give its service access in `service_access.py`.\n8. Add it to the section's **Settings** table in `docs/use/`.\n\n## Add an API route\n\nAdd it to the section's `router.py`. A new prefix also goes in the manifest's `routes` (`module.py`).\n\n## Add a map control\n\nA class extending `SentinelControlBase` in `services/sections/<id>/frontend/src/controls/<feature>/` (or `map-kit` if shared). Give it an accessible name and keyboard use, and make what it shows reachable as text. Bundle any font's glyphs under `frontend/assets/fonts/`.\n\n## Add a bus subject or decoder kind\n\n- Subject: [Event bus](../architecture/bus-and-security.md#event-bus).\n- Decoder: [A new decoder kind](../architecture/radios.md#a-new-decoder-kind).\n\n## Add a section\n\nCopy Space and rename. `git grep -n sentinel_space` and `git grep -n section-space` find every place to wire in:\n\n- `services/sections/<id>/backend/` and `frontend/`\n- `backend/pyproject.toml` (dependency, path source, import-linter), `backend/Dockerfile` (two `COPY`s)\n- `docker-compose.yml` (service, volume, code mount, credentials mount)\n- `service_access.py`, `nats_permissions.py`, `conftest.py`, `tests/in_process_app.py`\n- `frontend/vue/package.json`, `frontend/vue/src/shell/sections.ts`\n- `.github/workflows/ci.yml` (smoke job), `docs/use/<id>.md`, `docs/nav.json`\n\nThen `uv lock --project backend`, `npm install`, and rebuild the image.\n\n## Ship a frontend change\n\n1. `cd frontend/vue && npm run build`\n2. `npm run test:e2e`\n3. Commit `frontend/spa-dist/` separately: `build(spa): …`\n\n## Add or change a docs page\n\n1. Follow the [Air](../use/air.md) page: one-line summary, **Features**, short how-to, off grid, **Settings**, tips, **If it's not working**.\n2. Add it to `docs/nav.json`.\n3. `npm run check:doc-links`.\n4. Rebuild and commit `frontend/spa-dist/`; `docker compose up --build -d` for the live stack.\n\nDiagrams: put each mode's nodes in a subgraph titled `ONLINE` or `OFF GRID` and give it `class <id> online` or `offgrid`.\n\nScreenshots come from a script, at twice screen resolution: `cd frontend/vue && npm run build && npm run docs:screenshots` (needs internet for map tiles; add `PLAYWRIGHT_CHANNEL=chrome` if Playwright's browser isn't installed).\n",Hn="# Set up for development\n\nFrom a fresh clone to editing with live reload. Branches and commits: [Contributing](../../CONTRIBUTING.md).\n\n## You need\n\n- Docker with Docker Compose\n- [nvm](https://github.com/nvm-sh/nvm) with Node 24 or 25 and npm 11 (`.nvmrc` says 24)\n- [uv](https://docs.astral.sh/uv/) (it manages Python 3.12+)\n- Git\n\n## First time\n\n```bash\ngit clone https://github.com/barrygee/Sentinel.git && cd Sentinel\nnvm use && npm ci                 # every frontend package, plus the pre-commit hook\nuv sync --project backend         # backend packages, for tests, lint and your editor\ndocker compose up --build -d      # http://localhost:8080\n```\n\nThe wrong Node or npm fails with `EBADENGINE` on purpose.\n\n## The dev loop\n\n- **Backend:** code is mounted into the containers with `uvicorn --reload`. Save a `.py` and that service restarts in a second or two (`docker compose logs -f <service>`).\n- **Frontend:** `cd frontend/vue && npm run dev`, then open **http://localhost:5173**. Hot reload; API and WebSockets pass through to :8080.\n- **What :8080 serves** is the committed `frontend/spa-dist/`. Rebuild with `cd frontend/vue && npm run build` and reload; commit it. Docs are bundled too.\n- **Rebuild images** only when dependencies change (`pyproject.toml`, `package.json`).\n\n## Run less\n\n```bash\ndocker compose up -d gateway sea           # core and one section\ndocker compose up -d gateway sdr radio     # SDR needs the hub\ndocker compose stop sea                    # see how the rest behave without it\n```\n\n## Two rules that save time\n\n- **Install from the root** (`npm ci`); add an app dependency with `npm install <package> -w frontend/vue`. The root `package.json` is tooling, not the app.\n- **Run `uv` from the root with `--project backend`.** `Missing required plugins: pytest-asyncio` means pytest is outside the backend venv: fix the command.\n\nTurn on format-on-save (Prettier for TS/Vue, ruff for Python).\n",Un="# Testing\n\nCI runs everything here on each pull request and push to `main`; all of it must pass. Run from the repo root unless the line starts with `cd`.\n\n## Backend\n\n```bash\nuv run --project backend ruff check backend services/sections services/radio\nuv run --project backend ruff format --check backend services/sections services/radio\nPYTHONPATH=. uv run --project backend lint-imports --config backend/pyproject.toml\nuv run --project backend pytest\nuv run --project backend pytest tests/backend/test_routers_air.py::test_name\n```\n\n- Tests need no Docker: one all-in-one app (`tests/in_process_app.py`), an in-memory database, and your `.env` ignored.\n- Format one file with `--config backend/pyproject.toml`, or it uses a different line length.\n- mypy is informational, not a gate.\n\n## Frontend\n\n```bash\ncd frontend/vue && npm run lint && npm run typecheck && npm run test:coverage\nnpm run web-packages -- lint          # also: typecheck, test:coverage (every package)\nnpm run lint && npm run typecheck && npm run check:doc-links   # root tooling\n```\n\n- **100% coverage** everywhere, or CI fails. Cover edge cases, give every component a `jest-axe` test, and check each test fails when the code is wrong.\n- Truly unreachable branch: `/* v8 ignore start */ … /* v8 ignore stop */` with a reason (the `next` form doesn't work here).\n\n## Browser tests\n\n| Suite | Where | Run |\n|---|---|---|\n| App e2e + axe | `frontend/vue/e2e/` | `cd frontend/vue && npm run build && npm run test:e2e` |\n| Full-stack smoke | `tests/e2e/` | `docker compose up -d --wait && npm run test:e2e:gateway` |\n\n- **Vitest passing isn't enough.** UI restructuring breaks e2e while unit tests pass. Run it before pushing UI changes.\n- e2e tests the **built** `frontend/spa-dist/`: build first.\n- The smoke suite writes to the stack's databases: use a throwaway stack. CI runs it three ways (all sections, only SDR, all but SDR).\n\n## Traps\n\n- **Strict mode:** a locator matching two elements fails. Use `.first()` for \"at least one\".\n- **Stale preview server:** `lsof -ti :4173 | xargs kill`, rebuild, rerun.\n- **No Playwright browser:** `PLAYWRIGHT_CHANNEL=chrome`.\n- **Wrong Node:** `nvm use` in each terminal.\n- **CI `504` downloading go-pmtiles:** GitHub, not you. `gh run rerun <run-id> --failed`.\n",Wn=`# Hardware

Online you need no radio. A radio adds listening, recording, decoding and everything off grid.

## One dongle per job

| Job | Dongle | Antenna | Decoder |
|---|---|---|---|
| Listen, record, scan | Any RTL-SDR | Suits the band | — |
| Satellite passes | Shares the listening dongle | V-dipole or turnstile for 137 MHz | — |
| Aircraft off grid | One on a Sentry host | 1090 MHz | \`adsb\` |
| Ships off grid | One, full time | Marine VHF (162 MHz), high | \`ais\` |
| APRS | One, full time | 2 m (144 MHz) | \`aprs\` |
| Digital voice | One, while decoding | Suits the band | \`voice-decoder\` |

## Tips

- **Dongle:** RTL-SDR (25 MHz to 1.7 GHz). Pick one with a TCXO, such as the RTL-SDR Blog V3 or V4, so it doesn't drift.
- **Antenna matters most.** Match the band. Height beats gain. Keep cable short.
- **rtl_tcp** shares one dongle, no password: \`rtl_tcp -a 0.0.0.0 -p 1234\`. **Sentry** shares several and lets Sentinel claim and tune them (needed for off-grid ADS-B).
- **Network:** about 33 Mbps per dongle to the radio hub (38 Mbps for ADS-B). Wire it, or run the [radio hub by the dongles](radio-host.md). The browser link is light.
- **Computer:** anything that runs Docker (macOS, Windows, Linux; Intel/AMD or 64-bit ARM such as a Pi 4 or 5).
- **Disk:** a few GB for Sentinel, plus recordings (raw IQ is about 14 GB an hour) and offline maps (shown before you download).

## Build for another computer

\`docker buildx bake\` builds the backend image for \`linux/amd64\` and \`linux/arm64\` (on Linux, first \`docker run --privileged --rm tonistiigi/binfmt --install all\`):

\`\`\`bash
IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push   # both, to your registry
docker buildx bake --set '*.platform=linux/arm64' --load                # one, to this computer
docker buildx bake decoders --set '*.platform=linux/arm64' --load       # decoders, local only
\`\`\`

Never push decoder images to a public registry (the voice decoder includes mbelib).

## Linux "USB buffer" errors

As root on the computer with the dongle: \`echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb\`. To keep it after a reboot, add \`usbcore.usbfs_memory_mb=0\` to the kernel command line (Pi: \`/boot/firmware/cmdline.txt\`).
`,Gn=`# Welcome to Sentinel

A live map of what is around you, and a control panel for your own radios. It runs on your computer and keeps working with no internet.

| Section | What you get |
|---|---|
| **AIR** | Aircraft near you, with emergency alerts |
| **SPACE** | Satellites, and when they pass over you |
| **SEA** | Ships near you |
| **LAND** | UK amateur repeaters and APRS stations |
| **SDR** | Your radios: see a band, listen, scan, record, decode |

## Online or off grid

- **Online:** data comes from free internet feeds. You need no radio.
- **Off grid:** data comes from your own radios, maps you downloaded and data already stored. See [Off grid](use/off-grid.md).

## Start here

- [Quick start](install.md): running in four commands
- [The screen](use/interface.md): what each part does
`,Kn=`# Quick start

You need [Docker](https://www.docker.com/products/docker-desktop/) (with Docker Compose) and Git.

## Start

\`\`\`bash
git clone https://github.com/barrygee/Sentinel.git
cd Sentinel
cp .env.example .env
docker compose up --build -d
\`\`\`

Open **http://localhost:8080**. The first build takes a few minutes; after that, \`docker compose up -d\` starts it.

## First things to set

In **Settings** (the gear, bottom right), then **APPLY CHANGES**:

1. **App Settings › Sentinel Location**: your latitude and longitude.
2. **SPACE › Online Data Source**: pick a category, then **UPDATE TLE**.
3. **SEA › AIS Data API Key**: a free key ([how](use/sea.md#add-your-aisstream-key)).
4. **SDR › SDR Devices**: your radio, if you have one ([how](use/sdr/add-a-radio.md)).

Air works straight away. Land starts switched off ([switch it on](use/land.md#switch-land-on)).

## Run only some sections

\`\`\`bash
docker compose up -d gateway air sea           # just these
docker compose up -d gateway sdr radio         # SDR needs the radio hub
docker compose up -d --scale land=0            # everything but one
\`\`\`

## Add decoders

Each decoder needs its own dongle. See [Decoders](decoders.md).

\`\`\`bash
docker compose --profile all up -d --build     # or: adsb, ais, aprs, voice-decoder
\`\`\`

## Stop

\`\`\`bash
docker compose down     # your data is kept
\`\`\`
`,qn=`# Run and maintain

Everyday commands, health, logs and backups. Every container: [Ports and services](reference/ports-and-services.md).

## Commands

\`\`\`bash
docker compose up -d                          # start, or apply a change
docker compose up -d --build                  # after an upgrade
docker compose up -d --scale land=0           # without a section (repeat on every up)
docker compose ps                             # what runs, and whether it is healthy
docker compose logs -f app sea                # follow logs
docker compose logs --since 10m radio         # recent logs
docker compose restart sea                    # restart one service
docker compose down                           # stop; data is kept
docker compose down -v                        # stop and DELETE every volume
\`\`\`

Decoders are in profiles: \`docker compose --profile all logs aprs-decoder\`.

## Health

- \`docker compose ps\`: every Sentinel service says **(healthy)**. **(health: starting)** means it is waiting for core.
- Decoders say **Up**. \`service-credentials\` runs once and says **Exited (0)** (\`ps -a\`).
- \`curl -s http://localhost:8080/health\` answers \`{"status":"ok", …}\`.
- In the browser, a stopped section is greyed out; the rest keep working.

A healthy start, per section:

\`\`\`text
sea service startup: waiting for core to answer (…)          # only if it started first
sea service startup: connected to core at http://app:8000 after 4.2 s
event bus connected to NATS at tls://nats:4222
registration: sea registered with core at http://app:8000
\`\`\`

## What to back up

Volumes are named \`<folder>_<volume>\`, such as \`sentinel_sdr_data\`. List them with \`docker volume ls\`.

| Volume | Holds | Back up |
|---|---|---|
| \`sentinel_db\` | Settings, alerts, offline maps | Yes |
| \`sdr_data\` | Frequencies, groups, ranges, recording details | Yes |
| \`sdr_recordings\` | Recording files | If you want them |
| \`radio_data\` | Sentry hosts and passwords | Yes (store safely) |
| \`air_data\`, \`sea_data\`, \`land_data\`, \`space_data\` | Caches | Only for off grid |
| \`service_credentials\` | Certificates and logins | No: recreated |

For settings alone: **Settings › App Settings › Export All Configuration**.

## Back up or restore a volume

Stop Sentinel first. The commands use \`alpine\` (\`docker pull alpine\` now if you may be offline later).

\`\`\`bash
docker compose down
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine tar czf /backup/sdr_data.tgz -C /data .   # back up
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine tar xzf /backup/sdr_data.tgz -C /data     # restore into an empty volume
docker compose up -d
\`\`\`

## Developer commands

\`\`\`bash
docker compose up -d --build --no-deps sea    # rebuild one without restarting core
docker compose exec sea sh                    # a shell inside a service
docker compose config sea                     # what a service will receive
\`\`\`
`,Jn=`# Radio host

Run the radio hub and the voice, APRS and AIS decoders on a second computer by the antennas. Only the light browser stream then crosses your network. The main computer (the **core host**) keeps everything else.

*Figure: The two computers and the TLS links between them.*

\`\`\`mermaid
flowchart TB
    browser["Browser"] -- "http :8080" --> gateway
    subgraph core["CORE HOST"]
        gateway["gateway<br/>:8080, :8443"]
        nats["nats<br/>:4222"]
        app["app and sections"]
        gateway --> app
    end
    subgraph radiohost["RADIO HOST"]
        rgw["radio-host-gateway<br/>:8443"]
        radio["radio hub"]
        decoders["decoders"]
        rgw --> radio
        radio <-- "audio out,<br/>events back" --> decoders
    end
    gateway -- "TLS: radio requests" --> rgw
    radio <-- "TLS: register, settings" --> gateway
    radio <-- "TLS: events" --> nats
    dongles["Your dongles"] -- "IQ samples" --> radio
\`\`\`

- The browser only talks to the core host on :8080.
- Radio requests cross to the radio host's gateway on :8443; the hub calls back on :8443 and :4222.
- Decoders stay on the radio host's own network, so no audio crosses the LAN.

You need fixed names for both (here \`sentinel.lan\` and \`radio.lan\`), Docker and a Sentinel checkout on each.

## Core host

1. Add to \`.env\` (and take decoder profiles except \`adsb\` out of \`COMPOSE_PROFILES\`):

   \`\`\`bash
   SENTINEL_RADIO_REPLICAS=0
   SENTINEL_CORE_HOSTNAMES=sentinel.lan
   SENTINEL_RADIO_HOST_HOSTNAMES=radio.lan
   SENTINEL_SERVICE_ENTRYPOINT_ADDRESS=0.0.0.0:8443
   NATS_PUBLISHED_ADDRESS=0.0.0.0:4222
   \`\`\`

2. Apply, and export the radio host's credentials (treat the file as a password):

   \`\`\`bash
   docker compose up -d
   docker compose restart nats
   docker compose run --rm -T service-credentials \\
       python -m backend.scripts.service_credentials_bundle export radio-host > radio-host-credentials.tar.gz
   scp radio-host-credentials.tar.gz <radio-host-user>@radio.lan:<sentinel-folder>/
   rm radio-host-credentials.tar.gz
   \`\`\`

## Radio host

1. Create \`.env\`:

   \`\`\`bash
   SENTINEL_CORE_ENTRYPOINT_URL=https://sentinel.lan:8443
   SENTINEL_CORE_NATS_URL=tls://sentinel.lan:4222
   SENTINEL_RADIO_HOST_URL=https://radio.lan:8443
   COMPOSE_PROFILES=aprs,ais
   \`\`\`

2. Import and start:

   \`\`\`bash
   docker compose -f compose.radio-host.yaml run --rm -T credentials-import < radio-host-credentials.tar.gz
   rm radio-host-credentials.tar.gz
   docker compose -f compose.radio-host.yaml up -d --build
   \`\`\`

## Check

- Radio host, \`docker compose -f compose.radio-host.yaml logs radio\`: \`connected to core at https://sentinel.lan:8443\`, \`event bus connected\`, \`registration: radio registered\`.
- Core host, \`docker compose logs app\`: \`registry: radio radio registered from https://radio.lan:8443\`.
- In the browser: re-add Sentry hosts (the new hub starts with none), and check radio addresses as seen from the radio host (\`host.docker.internal\` for one on the radio host itself).

## Later

- **Host name changed:** update the hostnames, \`docker compose up -d\` and \`docker compose restart nats gateway\` on the core host, then export and import again.
- **Replace a login:** delete its \`credentials/<caller>/\` folder on the \`service_credentials\` volume, \`docker compose up -d\`, export and import again.
- **Move the hub back:** \`docker compose -f compose.radio-host.yaml down\` on the radio host; remove \`SENTINEL_RADIO_REPLICAS=0\` on the core host and \`docker compose up -d\`.

## If it's not working

| Hub log or symptom | Cause |
|---|---|
| \`… certificate verify failed …\` | The name in \`SENTINEL_CORE_ENTRYPOINT_URL\` isn't in \`SENTINEL_CORE_HOSTNAMES\`, or the credentials predate a name change |
| \`… Connection refused …\` | :8443 still on \`127.0.0.1\`, or a firewall |
| Never logs \`event bus connected\` | \`NATS_PUBLISHED_ADDRESS\` not open, or \`nats\` not restarted |
| SDR shows the hub unavailable | Core can't reach \`SENTINEL_RADIO_HOST_URL\` on :8443 |
| \`core refused radio (401)\` | Credentials out of date: export and import again |
`,Yn=`# Glossary

## Radio

| Word | Means |
|---|---|
| **ADS-B** | Aircraft broadcasting position, height, speed and callsign on 1090 MHz |
| **AIS** | Ships broadcasting position, course and name on 161.975 and 162.025 MHz |
| **AISStream** | A free online AIS feed; one connection per key |
| **APRS** | Amateur stations sharing positions and messages (144.800 MHz in Europe) |
| **Band plan** | Which signals live where; drawn along the waterfall |
| **Dongle** | A USB radio stick (RTL-SDR) |
| **Decoder** | A container that turns a digital signal into data or voice |
| **IQ** | The raw signal: the whole band the radio receives |
| **Pass** | A satellite crossing your sky, rise (AOS) to set (LOS) |
| **Repeater** | A hilltop station that retransmits, so handhelds reach further |
| **rtl_tcp** | A program that shares one dongle over the network |
| **SDR** | Software-defined radio; also Sentinel's radio section |
| **Sentry** | A Raspberry Pi program that shares several dongles |
| **Squawk** | A transponder code; 7700, 7600 and 7500 raise alerts |
| **TLE** | Public orbit data for a satellite |
| **Waterfall** | Signal strength across a band, scrolling over time |

## Sentinel

| Word | Means |
|---|---|
| **Core** | The \`app\` service: settings, alerts, offline maps, the service list |
| **Gateway** | The one address a browser uses (port 8080) |
| **Off Grid** | Using only your radios, downloaded maps and stored data |
| **Radio** | One dongle added to Sentinel |
| **Radio host** | A second computer running the radio hub and decoders |
| **Radio hub** | The \`radio\` service, the only part that talks to radios |
| **Section** | AIR, SPACE, SEA, LAND or SDR |
| **Sentinel Location** | Your position, set in Settings |

## Developer

| Word | Means |
|---|---|
| **Capability** | A service one section offers others through the shell, such as SDR's \`radio\` |
| **Event bus** | Short messages between services on named subjects, over NATS |
| **Lifecycle** | A module's \`prepare\`, \`start\`, \`wake\` and \`stop\` hooks |
| **Manifest** | What a service tells core when it registers: id, address, paths |
| **Module Federation** | How the shell loads each section's UI at run time |
| **Profile** | An optional group of containers, started with \`--profile\` |
| **Remote** | A section's UI bundle, loaded by the shell |
| **Settings client** | How a service reads and writes settings through core |
| **Shell** | The Vue app hosting every section's UI |
`,Xn="# Ports and services\n\nEvery container, its job, ports and data. Containers are named `sentinel-<service>` (`docker logs sentinel-sea`).\n\n## Always running\n\n| Service | Job | Data |\n|---|---|---|\n| `service-credentials` | Runs once: certificates and a login per service and decoder | `service_credentials` |\n| `nats` | Event bus, TLS only | — |\n| `app` | Core: the UI, settings, alerts, offline maps, service list | `sentinel_db` |\n| `gateway` | Caddy: the one address a browser uses | — |\n| `air`, `space`, `sea`, `land` | Each section | `<id>_data` |\n| `sdr` | Frequencies, groups, ranges, recordings | `sdr_data`, `sdr_recordings` |\n| `radio` | Radio hub: radios, spectrum, audio, decoding, IQ capture | `radio_data` |\n\n## Decoders (profiles)\n\n| Profile | Service | Decodes |\n|---|---|---|\n| `voice-decoder` | `voice-decoder` | Digital voice (dsd-fme) |\n| `aprs` | `aprs-decoder` | APRS (Direwolf) |\n| `ais` | `ais-decoder` | AIS (Direwolf 1.8) |\n| `adsb` | `adsb-decoder` | ADS-B (readsb) |\n| `decoder-stub` | `stub-decoder` | Nothing: a test double |\n\n`--profile all` starts the first four.\n\n## Ports on your computer\n\n| Port | Service | Open to your network |\n|---|---|---|\n| `8080` | gateway (browsers) | Yes |\n| `8443` | gateway TLS entrypoint (radio host) | Only with `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` |\n| `4222` | nats (radio host) | Only with `NATS_PUBLISHED_ADDRESS` |\n| `8090` | adsb-decoder | Only with `SENTINEL_ADSB_DECODER_ADDRESS` |\n\n## Inside Docker only\n\n| Port | Where | What |\n|---|---|---|\n| `8000` | app, sections, radio | HTTP API |\n| `2019` | gateway | Caddy admin API (core pushes routes) |\n| `7355`, `7356` UDP | radio | Voice decoder audio out, decoded voice back |\n| `7357` | radio | APRS decoder audio |\n| `7358` | radio | AIS decoder stereo audio |\n| `7370` | radio | Stub decoder audio |\n\n## On a radio host\n\n`compose.radio-host.yaml`: `credentials-import` (runs once), `radio`, `radio-host-gateway` (:8443), and the voice, APRS, AIS and stub decoders.\n",Zn="# Troubleshooting\n\nStart with `docker compose ps -a`: every Sentinel service should say **(healthy)**. Each section's page has its own **If it's not working**.\n\n## Won't start\n\n| You see | Do |\n|---|---|\n| `Cannot connect to the Docker daemon` | Start Docker |\n| `port is already allocated` (8080) | Stop whatever else uses 8080 |\n| `gateway` or `nats` exited (8443 / 4222) | Something else uses the port; see [Ports](reference/ports-and-services.md) |\n| First build fails downloading | Run `docker compose up --build -d` again |\n| Sections stuck at **(health: starting)** | `docker compose logs app`; sections wait for core |\n| Linux: `Permission denied` on `sentinel_config.json` | Set `SENTINEL_RUNTIME_USER_ID` / `_GROUP_ID` ([how](configuration.md#where-files-go)) |\n\n## A section is missing\n\n| You see | Do |\n|---|---|\n| Not in the menu | `docker compose up -d <section>` |\n| **LAND** not in the menu | [Switch Land on](use/land.md#switch-land-on) |\n| Greyed out, **section unavailable** | `docker compose logs <section>`, then `docker compose restart <section>` |\n| SDR has no waterfall or audio | The radio hub is down: `docker compose logs radio` |\n\n## Service logins\n\n| Response | Cause |\n|---|---|\n| 503 `Internal service access is disabled` | `service-credentials` didn't run: `docker compose up -d` |\n| 401 `Invalid service credential` / `invalid decode secret` | Logins were recreated; restart the service (radio host: export and import again) |\n| 403 `This service may not do that` | A fault in Sentinel: report it |\n\nA 404 from `/internal/…` on :8080 is on purpose.\n\n## Log messages\n\n| Message | Means |\n|---|---|\n| `waiting for core to answer` / `waiting for the radio hub` | Normal at start-up |\n| `legacy import: copied N rows into …` | Normal, once, after an upgrade |\n| NATS `permissions violation` | A fault in Sentinel |\n| `ConnectError` from several sections for a few seconds | Core restarted |\n| Radio hub: `401`, a login, then `200` | Normal first sign-in to a Sentry; a `401` on the login itself is a wrong password |\n\n## Still stuck\n\n```bash\ndocker compose logs --since 15m > sentinel-logs.txt\n```\n\nCheck it for addresses and radio names, then report it on [GitHub](https://github.com/barrygee/Sentinel/issues).\n",Qn="# Upgrade\n\n```bash\ngit pull\ndocker compose up --build -d      # add --profile … if you run decoders without COMPOSE_PROFILES\ndocker compose ps                 # everything (healthy)\n```\n\nThen hard-reload the browser (Ctrl+Shift+R, Cmd+Shift+R on macOS). Data is kept; databases update themselves.\n\n- **What changed:** the [changelog](https://github.com/barrygee/Sentinel/blob/main/CHANGELOG.md), or `CHANGELOG.md` in your copy.\n- **Want a way back?** [Back up](operations.md#back-up-or-restore-a-volume) first.\n- **Go back:** `git checkout <commit>` then `docker compose up --build -d`. Return with `git checkout main && git pull`.\n\nCheck the one-off steps below for anything newer than your copy (`git log -1 --format=%cd`).\n\n## One-off steps\n\n### Radio hub renamed `radio-hub` → `radio` (October 2026)\n\nOnly if `docker volume ls` shows `…radio_hub_data`. Do it before starting the new version.\n\n```bash\ndocker compose down\ndocker volume create --label com.docker.compose.project=sentinel \\\n  --label com.docker.compose.volume=radio_data sentinel_radio_data\ndocker run --rm -v sentinel_radio_hub_data:/from -v sentinel_radio_data:/to alpine \\\n  sh -c 'cp -a /from/. /to/ && cd /to && for file in radio-hub.db*; do mv \"$file\" \"radio${file#radio-hub}\"; done'\ndocker run --rm -v sentinel_service_credentials:/credentials alpine \\\n  mv /credentials/services /credentials/services-old\n```\n\n- Use your folder's name in place of `sentinel` if it differs.\n- In `.env`, rename `SENTINEL_RADIO_HUB_REPLICAS` to `SENTINEL_RADIO_REPLICAS`.\n- Upgrade as usual, then check `docker logs sentinel-radio`.\n- Radio host: export and import its credentials again.\n- Afterwards: `docker volume rm sentinel_radio_hub_data`.\n\n### Every section is its own service (October 2026)\n\n- Data moves itself on first start (`legacy import: copied N rows …`).\n- Remove from `.env`: `SENTINEL_EXTERNAL_SERVICES`, `SENTINEL_RADIO_HUB_HOST`, `SENTINEL_JOIN_TOKEN`, `SENTINEL_DECODER_SECRET`, and section names in `COMPOSE_PROFILES`. Rename `NATS_SERVER_EXTRA_HOSTNAMES` to `SENTINEL_CORE_HOSTNAMES`.\n- After a good start: `docker volume rm sentinel_nats_setup sentinel_join_token sentinel_decoder_secret`.\n- Going back to an older version loses what was created since.\n\n### Containers no longer run as root (October 2026)\n\nLinux only: if your user isn't 1000, set `SENTINEL_RUNTIME_USER_ID` and `_GROUP_ID` in `.env`.\n",$n=`# Air

Live aircraft near you, from ADS-B. Online from [adsb.lol](https://adsb.lol); off grid from your own radio.

## Features

- **Live map** of aircraft within 250 nautical miles of the map centre, updated every few seconds.
- **Aircraft details**: height, speed, heading, climb, type, registration, category and squawk. **SIGNAL LOST** when it stops reporting.
- **Track aircraft**: keep the map on it; it is listed under **TRACKING**.
- **Landing and take-off alerts** for an aircraft you choose (**Enable alerts**).
- **Emergency alerts** for squawks 7700 (emergency), 7600 (radio failure) and 7500 (hijack), even with no browser open.
- **Overhead alerts** when civil or military aircraft come near your location or a Sentry site.
- **Search** by callsign, ICAO address or squawk in **FILTER**.
- **Show** all, civil or military aircraft, airports or military bases.
- **Airport frequencies**: select one to tune your radio to it in AM.
- **Layers**: **RANGE RING**, **A2A REFUELING**, **AWACS**, **TERRAIN**, more under **MAP LAYERS**.

![An aircraft's details in the FILTER pane: POSITION and IDENTIFICATION, squawk 7700, and the track, alert and centre buttons beneath. The aircraft is highlighted in red on the map.](../images/air-aircraft-details.png)

## Off grid

You need a dongle with a 1090 MHz antenna on a [Sentry host](sdr/add-a-radio.md#add-a-sentry-host), and the ADS-B decoder.

1. \`docker compose --profile adsb up -d --build\`
2. **Settings › AIR › Off Grid ADS-B SDR**: pick the dongle.
3. Set **OFF GRID** (app-wide **Connectivity Mode**, or Air's **Source Override**), then **APPLY CHANGES**.

Opening Air claims the dongle and tunes it to 1090 MHz; closing it lets it go. It uses about 38 Mbps on your network while open.

## Settings

All in **Settings › AIR**.

| Setting | What it does |
|---|---|
| **Source Override** | **ONLINE** or **OFF GRID** for Air only |
| **Off Grid ADS-B SDR** | The Sentry dongle used off grid |
| **Online Data Source** | The online feed. Default \`https://api.adsb.lol/v2\` |
| **Online / Off Grid Squawk Checks** | Seconds between emergency checks while no Air map is open. Default 20 |
| **Map Layers** | Layers on when the map opens |
| **Overhead Aircraft Alerts** | Places to watch, civil or military, and how close |
| **Label Data Points** | What each aircraft label shows |

## Tips

- Set **Sentinel Location** first: emergency checks and range rings centre on it.
- Off grid, the map centres on your receiver; it only hears around itself.

## If it's not working

- **Empty off grid:** read the notice at the top of the map. Check **Off Grid ADS-B SDR** and \`docker compose --profile adsb ps\`. A decoder that streams but accepts 0 messages is an antenna or signal problem.
- **"No data source configured":** **Online Data Source** is empty.
- **AIR greyed out:** \`docker compose logs air\`.
`,er=`# Alerts

Tells you when something you care about happens, in any section.

## What raises one

| Alert | When | Turn it on |
|---|---|---|
| Aircraft emergency | Squawk 7700, 7600 or 7500, even with no browser open | Always on |
| Landing / take-off | A chosen aircraft lands or takes off | **Enable alerts** on the aircraft |
| Aircraft overhead | Civil or military aircraft near your location or a Sentry site | **Settings › AIR › Overhead Aircraft Alerts** |
| Satellite pass | A chosen satellite rises in about five minutes | The bell on a pass |
| Auto-tune | The radio retuned for a pass, or couldn't | **Auto-tune SDR** on a pass |
| SDR device | A Sentry dongle was plugged in or unplugged | Always on |
| Tracking | You started or stopped following something | Automatic |

## Features

- **ALERTS** pane, newest first. The button pulses for unseen alerts.
- **Select an alert** to jump to its aircraft or satellite.
- **Dismiss** (✕) one, **Disable alerts** (crossed bell) for that subject, **Disable autotune** on a pass alert, or **Clear alerts**.
- **Alert Sound** (**Settings › App Settings**).
- **Kept on the server**: alerts raised while no browser was open are waiting next time.
- **Settings › App Settings › Alerts** lists every alert you have set up, each with a switch.

![The ALERTS pane: an aircraft emergency marked EMERGENCY in red at the top, a satellite pass notice below it, each with a dismiss button, and CLEAR at the bottom.](../images/alerts-pane.png)
`,tr=`# The screen

Every section uses the same layout.

![The Air section: the section menu across the top, the sidebar rail and FILTER list on the left, the map in the middle with aircraft DEMO303 shown in red because it is squawking 7700, the map controls on the right, and the footer with the gear for Settings.](../images/interface-air-screen.png)

## Parts

| Part | Where | What it does |
|---|---|---|
| **Section menu** | Top right | **AIR**, **SPACE**, **SEA**, **LAND**, **SDR**. Greyed out = that section has stopped. |
| **Sidebar** | Left | **FILTER** (search and list what is on the map), **ALERTS**, **TRACKING**, plus section extras such as **PASSES**. |
| **Map** | Middle | Select anything to see its details. |
| **Map controls** | Right | Zoom, **GO TO MY LOCATION**, and layer buttons such as **RANGE RING** and **TERRAIN**. |
| **Footer** | Bottom | Sidebar toggle, the frequency a radio is playing, the gear for **Settings**, the map-controls toggle. |
| **Settings** | Full screen | **App Settings**, then one entry per section, then **Docs**. |

## Keyboard

- **Tab** / **Shift+Tab** move between controls; the first **Tab** offers **Skip to main content**.
- **Enter** or **Space** presses a button. Arrow keys move within a group of options.
- **Escape** closes Settings, Docs or a menu.

## On a phone

![Sentinel on a phone: the section menu is behind the three-line button at the top right, and the map fills the screen.](../images/interface-phone.png)

- The section menu and **SETTINGS** are behind the three-line button.
- Sidebar panes open over the map.

## Tips

- Every **FILTER** list doubles as a text version of the map, for screen readers.
- Audio from the SDR keeps playing in every section; the footer shows what is tuned.
- These docs are built in, so they work offline. Search finds any word on any page.
`,nr=`# Land

For radio amateurs: every UK repeater, and the APRS stations your radio hears. Two map layers, shown one at a time.

## Features

- **REPEATERS**: every UK amateur repeater from [ukrepeater.net](https://ukrepeater.net/), updated daily, with a built-in copy for offline use.
- **Repeater details**: site, locator, keeper, and per channel the output and input frequencies, offset, CTCSS / colour code, status, height, ERP and modes.
- **Listen**: select an **OUTPUT** frequency to tune your radio in the right mode.
- **SAVE FREQUENCY**: add a repeater to SDR's saved frequencies.
- **Search** by callsign, town, band or mode; filter by **Band**, **Mode** and **Status**.
- **APRS STATIONS**: stations heard by your radio, with their symbols and details. **RAW** shows the packet as received.

![A repeater's details: SITE information, then its 2 m channel with OUTPUT and INPUT frequencies (each with a save button), offset, CTCSS tone, status, height, power and mode.](../images/land-repeater-details.png)

## Switch Land on

Land starts switched off.

1. **Settings › App Settings › Application Config › EDIT**.
2. Under \`"land": {\`, change \`"enabled": false,\` to \`"enabled": true,\`.
3. **APPLY CHANGES**. Reload if **LAND** doesn't appear.

## Hear APRS stations

You need a dongle you can give to APRS full time and a 2 m antenna.

1. \`docker compose --profile aprs up -d --build\`
2. **Settings › LAND › Off Grid APRS SDR**: pick the radio, then **APPLY CHANGES**.
3. In **LAND**, choose **APRS STATIONS** under **FILTER**.

Decoding runs in the background, even with no browser open.

## Settings

All in **Settings › LAND**.

| Setting | What it does |
|---|---|
| **Off Grid APRS SDR** | The radio that decodes APRS |
| **APRS Channel** | Default 144.800 MHz; 144.390 MHz in North America |
| **APRS Label Fields** | What each station label shows |
| **APRS Retention** | Minutes a station stays after it was last heard. Default 5 |
| **Repeater Label Fields** | What each repeater label shows |
| **Repeater Directory (JSON)** | Edit or replace the directory; a replacement is kept 30 days |

## Tips

- Works fully off grid: the built-in directory takes over, and APRS is always your own radio.

## If it's not working

- **APRS STATIONS greyed out** (**NO SDR SET**): pick a radio in **Off Grid APRS SDR**.
- **APRS hears nothing:** check \`docker compose --profile aprs ps\`, and that the radio is on channel. Find its id with \`curl -s http://localhost:8080/api/sdr/radios\`, then \`curl -s http://localhost:8080/api/sdr/aprs/status/<id>\`: \`"on_channel": false\` means something moved it (it moves back within about 15 seconds).
`,rr=`# Maps

Every map shares one base map and one look. Download areas to keep maps working offline.

## Features

- **Map Style**: **DARK** (dim, night-friendly) or **LIGHT** (OpenStreetMap colours).
- **Base map layers**: **Roads**, **Location names**, **Borders**.
- **TERRAIN**: hill shading and contours, for judging line of sight. Needs terrain downloaded.
- **RANGE RING** around your location or a Sentry host (**Range Ring Origin**).
- **Sentry sites** marked on every map.
- **Offline areas**: download a region's basemap and terrain, to the depth you choose.

All of these are in **Settings › App Settings**.

## Download an area

Do this while online: downloading is turned off in **OFF GRID**.

1. **Settings › App Settings › Offline Maps**.
2. Choose the area: **DRAW AREA**, **USE CURRENT VIEW**, or type **NORTH**, **SOUTH**, **EAST**, **WEST**.
3. **DEPTH**: 6 (countries) to 14 (streets). Each step can take up to four times the space.
4. Tick **Basemap** and/or **Terrain**.
5. Check the size against **Free space**, then **DOWNLOAD**.

![Settings › App Settings › Offline Maps: a small world map to choose the area on, with DRAW AREA and USE CURRENT VIEW beneath.](../images/settings-offline-maps.png)

- Runs on the Sentinel computer: you can close the browser. One at a time; others wait as **QUEUED**. **CANCEL** stops one.
- Finished areas are listed with size and date; delete one with its button.
- Maps update as soon as a download finishes. No restart.

## Tips

- Keep it small: a large area at low depth, plus a small area at high depth where you are.
- Terrain stops adding detail at depth 12.
- Off grid, outside your downloaded areas the map is blank.

## Advanced: a base archive

Sentinel also reads hand-made [PMTiles](https://protomaps.com) files in \`frontend/assets/tiles/\`, used wherever no download covers the map. Cut them with the \`pmtiles\` tool (\`--bbox\` is \`west,south,east,north\`; \`YYYYMMDD\` is a current build from [build.protomaps.com](https://build.protomaps.com)):

\`\`\`bash
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
pmtiles extract https://download.mapterhorn.com/planet.pmtiles frontend/assets/tiles/uk-terrain.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=12
\`\`\`

## About the map data

Basemaps come from the newest [Protomaps](https://protomaps.com) build, found automatically; terrain from [Mapterhorn](https://mapterhorn.com). \`OFFLINE_BASEMAP_SOURCE_URL\` and \`OFFLINE_TERRAIN_SOURCE_URL\` in \`.env\` change them.

National park boundaries (\`frontend/assets/national-parks.geojson\`) are the ONS _National Parks (December 2022) Boundaries GB BGC_: Office for National Statistics, [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); contains OS data © Crown copyright and database right 2022.
`,ir=`# Off grid

Sentinel keeps working with no internet: your own radios, maps you downloaded and data already stored.

## What changes

*Figure: Each section in the middle, fed from its online source above or its off-grid source below.*

\`\`\`mermaid
flowchart TB
    subgraph onlineSources["ONLINE"]
        adsblol["adsb.lol"]
        celestrak["CelesTrak"]
        aisstream["AISStream"]
        ukrep["ukrepeater.net"]
        tiles["Online<br/>maps"]
    end
    adsblol --> air["AIR"]
    celestrak --> space["SPACE"]
    aisstream --> sea["SEA"]
    ukrep --> land["LAND"]
    tiles --> maps["Maps"]
    air ~~~ adsbdec
    space ~~~ tle
    sea ~~~ aisdec
    land ~~~ builtin
    maps ~~~ downloads
    subgraph offgridSources["OFF GRID"]
        adsbdec["ADS-B<br/>decoder"]
        tle["Stored<br/>TLEs"]
        aisdec["AIS<br/>decoder"]
        builtin["Built-in list,<br/>APRS decoder"]
        downloads["Downloaded<br/>maps"]
    end
    adsbdec --> air
    tle --> space
    aisdec --> sea
    builtin --> land
    downloads --> maps
    class onlineSources online
    class offgridSources offgrid
\`\`\`

| Section | Online | Off grid | You need |
|---|---|---|---|
| **AIR** | adsb.lol | ADS-B decoder | A dongle and 1090 MHz antenna on a Sentry host |
| **SPACE** | CelesTrak | Stored TLEs | TLEs loaded while online |
| **SEA** | AISStream | AIS decoder | A dongle and marine VHF antenna |
| **LAND** | ukrepeater.net | Built-in list; APRS always from your radio | A dongle and 2 m antenna, for APRS |
| **SDR** | Your radios | Your radios | — |
| **Maps** | Online | Downloaded areas | Areas downloaded while online |

## Before you lose internet

1. [Download maps](maps.md#download-an-area), with **Terrain** if you want it.
2. **Settings › SPACE › UPDATE TLE**.
3. Build the decoders you need: \`docker compose --profile all up -d --build\`.

## Switch over

1. Give each section its radio: **Off Grid ADS-B SDR** (AIR), **Off Grid AIS SDR** (SEA), **Off Grid APRS SDR** (LAND).
2. **Settings › App Settings › Connectivity Mode › OFF GRID**, then **APPLY CHANGES**.
3. Open each section. A notice at the top says what is missing, if anything.

To keep one section online, set its **Source Override** afterwards. A section's override wins over **Connectivity Mode**.

## Coming back

**Connectivity Mode › ONLINE**, **APPLY CHANGES**, then **UPDATE TLE**.

## If it's not working

- **Blank map:** you are outside your downloaded areas.
- **Positions wrong after weeks offline:** TLEs are old; update when you can.
`,ar=`# Receiving responsibly

Sentinel lets you hear a great deal of radio traffic. What you may listen to, and what you may do with what you hear, depends on where you are. This page is a short reminder, not legal advice: check the rules where you live.

## In the UK

- Listening to broadcasts meant for the public, amateur radio and similar open services is generally fine.
- Under the Wireless Telegraphy Act 2006, it is an offence to set out to learn the content of messages you are not authorised to receive, or to pass on what such a message said. That covers, for example, most private business radio and the emergency services. If you come across one by chance, don't share or act on it.
- Aircraft (ADS-B) and ship (AIS) positions are broadcast openly for safety. Sentinel's online feeds share them publicly.
- Transmitting needs a licence. Sentinel only receives.

[Ofcom](https://www.ofcom.org.uk/) publishes the current UK rules.

## Elsewhere

Rules differ from country to country, and sometimes by state or region. Some places restrict owning a scanner, using one in a vehicle, or decoding particular services. Check before you listen.

## Good habits

- Don't share recordings or decoded content from services that aren't meant for the public.
- Don't use Sentinel to follow or locate a particular person.
- Treat callsigns and positions you see as information about real people.
`,or=`# Radios

The SDR section turns cheap RTL-SDR dongles into a wide-band receiver you control from the browser. Sentinel reaches every dongle over your network, so it can sit by the antenna on another computer.

## Features

- **rtl_tcp radios**: one dongle per \`rtl_tcp\` program.
- **Sentry hosts**: a Raspberry Pi sharing several dongles. Sentinel can claim one, tune it and hand it back.
- **Host details**: status, uptime, software versions, device counts (**PRESENT**, **CONFIGURED**, **STREAMING**, **DEGRADED**, **ERROR**, **NEEDS ID**) and its position on a map.
- **Plug and unplug alerts** when a Sentry dongle appears or disappears.
- **FLASH SERIAL** gives a dongle a unique serial so Sentry can tell it apart (marked **NEEDS ID**).
- **Per dongle**: output port, antenna and notes, kept on the Sentry.
- **Sentry sites** on every map, usable as range-ring centres and overhead-alert places.
- **RESERVED** marks a radio held by a decoder, so nothing knocks it off its channel.

## Add an rtl_tcp radio

1. On the computer with the dongle: \`rtl_tcp -a 0.0.0.0 -p 1234\`.
2. **Settings › SDR › SDR Devices › + ADD SDR**: **NAME**, **IP ADDRESS**, **PORT** (usually \`1234\`), **SAVE**.
3. Open **SDR** and pick it at the top of the radio panel. It shows **CONNECTED** and the waterfall starts.

![The add-radio form in Settings › SDR › SDR Devices, with NAME, IP ADDRESS, PORT and STATUS, and CANCEL and SAVE buttons.](../../images/settings-add-radio.png)

## Add a Sentry host

1. **Settings › SDR › Sentry Hosts › + ADD SENTRY**: **IP ADDRESS**, **LABEL**, **PORT** (usually \`8000\`), **CONSOLE PASSWORD**, **SAVE**.
2. Its dongles are listed under **SDR Devices**. Add the ones you want.

![Settings › SDR: SENTRY HOSTS with + ADD SENTRY, DEVICES with + ADD SDR, and SDR OPTIONS below. Docs sits under the section buttons in the left rail.](../../images/settings-sdr.png)

A dongle marked private or disabled on its Sentry can't be added until you change it there.

## The radio panel

| Tab | For |
|---|---|
| **RADIO** | Pick a radio, tune, listen, record; **FAVOURITES**, **SCANNER**, **SEARCH** |
| **FREQUENCY MANAGER** | Saved frequencies |
| **GROUPS** | Colour-coded groups |
| **SEARCH RANGES** | Saved ranges to sweep |
| **RECORDINGS** | Play, download, note and delete recordings |

## Tips

- Each dongle serves one program at a time. Another connection shows **DISCONNECTED** here.
- \`rtl_tcp\` has no password; only share it on a network you trust.
- Without the radio hub (\`radio\`), saved frequencies and recordings still show, but no waterfall or audio.

## If it's not working

- **DISCONNECTED:** check \`rtl_tcp\` or Sentry is running, the address and port, and that nothing else is connected.
- **"USB buffer" errors on a Linux radio computer:** as root there, \`echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb\`.
- **Sentry won't connect:** \`docker compose logs radio\`. A refused login means a wrong console password.
- **RESERVED and can't be picked:** a decoder holds it. Choose another radio in that section's settings.
`,sr=`# Decode

Turn digital signals into voice, positions and messages. Each decoder is an optional container and needs **its own dongle** while it runs. Install them first: [Decoders](../../decoders.md).

## Decoders

| Decoder | You get | Shows in | Start it from |
|---|---|---|---|
| **Digital voice** | DMR, P25, NXDN, D-STAR, YSF and M17 voice and call details | SDR panel | **CONTROLS › DIGITAL MODE › DMR** |
| **APRS** | Amateur positions, weather, messages | Land map | **Settings › LAND › Off Grid APRS SDR** |
| **AIS** | Ships, no internet | Sea map | **Settings › SEA › Off Grid AIS SDR** |
| **ADS-B** | Aircraft, no internet | Air map | **Settings › AIR › Off Grid ADS-B SDR** |

## Digital voice

1. \`docker compose --profile voice-decoder up -d --build\` (first build takes minutes).
2. Tune to a digital voice channel and press **Tune** (▶).
3. **CONTROLS › DIGITAL MODE › DMR**. The decoder opens below the waterfall.

- Decoded voice plays; call details (talk group, radio ID) appear as calls arrive.
- Two views: decoded messages, and the raw decoder log. **Clear** empties them.
- Press **DMR** again to stop. Despite the label it decodes every mode in the table.

## APRS, AIS and ADS-B

Start these from their section's settings: [Land](../land.md#hear-aprs-stations), [Sea](../sea.md#off-grid), [Air](../air.md#off-grid).

- APRS and AIS keep their dongle on channel and decode in the background, even after a restart.
- ADS-B holds its dongle while the Air map is open.
- A held dongle reads **RESERVED** in the SDR panel.

## Tips

- Channels: APRS 144.800 MHz (Europe), AIS 161.975 and 162.025 MHz, ADS-B 1090 MHz. One dongle can't cover two.
- No sync before a call starts is normal.
- **Mute Audio While Decoding** hides the raw digital noise.
`,cr=`# Frequencies and scanning

Save frequencies, group them, and let Sentinel scan or sweep for activity.

## Features

- **Saved frequencies** with label, mode, groups and notes, marked on the waterfall. Each can keep its own radio settings (gain, squelch, bandwidth, volume, sample rate, zoom, waterfall range).
- **Favourites** (the star): one-click tuning from **FAVOURITES** on the **RADIO** tab.
- **Groups**: colour-coded; filter the list by group.
- **Scanner**: steps through saved frequencies (all, or chosen groups) and stops on a signal.
- **Search**: sweeps a range in steps for signals you haven't saved.
- **Saved ranges**: keep a range with its step, dwell time, mode and threshold.
- **Saved from other sections**: **SAVE FREQUENCY** on a Land repeater lands here.
- **JSON editor** for every frequency, group and range at once; **EXPORT** to back up or copy.

## Save a frequency

1. **FREQUENCY MANAGER › ADD FREQUENCY**: **LABEL**, **FREQ (MHz)**, **MODE**, optional **GROUPS** and **NOTES**.
2. **SAVE**. Use **Tune to** beside any saved frequency to listen.

Groups: **GROUPS** tab, type a name, **ADD**. Deleting a group keeps its frequencies.

## Scan

1. **RADIO › SCANNER**: choose **All** or some groups.
2. Set **SQUELCH** just above the noise: anything louder counts as a signal.
3. **Start scan**. It reads **SCANNING**, then **SCANNING PAUSED** while a signal plays, and carries on when it ends.

## Search a range

1. **RADIO › SEARCH**: **LOW (MHz)**, **HIGH (MHz)**, **STEP** (use the band's channel spacing, such as 12.5 kHz).
2. **Start search**. It stops on signals like the scanner.

To keep a range: **SEARCH RANGES › ADD RANGE**. It then appears under **SAVED RANGES** with its own start button.

## Settings

| Setting | What it does |
|---|---|
| **SDR Options › Scan / Search Resume Delay (Seconds)** | Wait after a signal ends before moving on |
| **Frequencies & Groups (JSON)** | Every frequency, group and range; **EDIT** or **EXPORT** |

## Tips

- Raise the resume delay to hear both sides of a conversation.
`,lr=`# Listen

See a whole band at once, tune to a signal and listen.

## Features

- **Spectrum**: signal strength across the band now. A peak is a signal.
- **Waterfall**: the same over time, newest at the top. Brighter is stronger.
- **Markers** for saved and known frequencies; **band plan** strip showing what each part of the band is for.
- **ZOOM**, drag the scale to move along the band, and min/max dB sliders to make weak signals stand out.
- **Tune** by selecting a signal, typing MHz and **Enter**, or scrolling over a digit.
- **Modes**: NFM, WFM, AM, USB, LSB, CW.
- **CONTROLS**: **VOLUME**, **SQUELCH**, **BANDWIDTH** (or drag its edges on the waterfall), **RF GAIN** or **AGC**, **SAMPLE RATE**.
- **SIGNAL** meter.
- **Plays everywhere**: audio continues in other sections, Settings and Docs; the footer shows the frequency.
- **Timestamps** down the waterfall, every so many seconds.

![The SDR section tuned to 145.5000 MHz: the radio panel on the left with the play, stop and record buttons, SIGNAL meter, MODULATION and settings; the spectrum and waterfall on the right with the tuned frequency marked.](../../images/sdr-radio-panel.png)

## Listen

1. Open **SDR** and pick your radio.
2. Tune to a frequency, and choose **MODULATION**.
3. **Tune** (▶) starts the audio; **Stop audio** (■) stops it.

## Which mode

| Mode | For |
|---|---|
| **NFM** | Two-way radio, amateur repeaters, PMR446, marine VHF |
| **WFM** | FM broadcast |
| **AM** | Airband |
| **USB** | Amateur voice above 10 MHz, data modes |
| **LSB** | Amateur voice below 10 MHz |
| **CW** | Morse |

## Settings

All in **Settings › SDR › SDR Options**.

| Setting | What it does |
|---|---|
| **Auto-center Waterfall on Tune** | Keeps the tuned frequency in the middle |
| **Snap to Known Frequencies** | Selecting near one tunes exactly to it |
| **Show Band Plan** | The coloured band strip |
| **Display Known Frequencies** | Frequency markers on the waterfall |
| **Mute Audio While Decoding** | Silence while a digital decoder runs |
| **Show Waterfall Timestamps** / **Interval (Seconds)** | Time marks down the waterfall |

**Band Plan (JSON)** (in **Settings › SDR**) edits the band strip for your country.

## Tips

- **SQUELCH**: raise it until the hiss stops, then a little more.
- **RF GAIN**: too high swamps everything; too low loses weak signals.
- A higher **SAMPLE RATE** shows more band but uses more network and CPU.

## If it's not working

- **No sound:** check **Tune** is on, volume up, squelch below the signal. Click the page once: browsers block sound until you do.
- **Distorted or crowded:** lower **RF GAIN** or narrow **BANDWIDTH**.
- **Only noise:** check the mode and that the antenna suits the band.
`,ur=`# Record

Record what you hear as WAV, and optionally the raw signal (IQ) to re-tune later.

## Features

- **WAV** of exactly what you heard, about 100 KB a second. Only the parts with the squelch open are kept.
- **Raw IQ** (\`.u8\`): the whole band the radio received, for SDR++, GQRX, Universal Radio Hacker or GNU Radio. About 4 MB a second.
- **RECORDINGS** tab: play, **Download WAV**, **DOWNLOAD IQ**, add a note, filter by **NOTES · MODE**, delete.
- **Satellite passes** record themselves from Space ([how](../space.md#catch-and-record-a-pass)).
- **Safety stop**: a recording left running past **Max Recording Length** is stopped and marked failed.
- **Folders**: sort new recordings into a subfolder, such as \`satellites/noaa\`.

## Record

1. Tune and press **Tune** (▶).
2. **Record** (●). The button shows ■ while recording, and a pause sign while the squelch is closed.
3. **Stop recording**.

## Where files go

Each recording is \`<id>.wav\` (and \`<id>.u8\`) in one folder.

- **Root**: the \`sdr_recordings\` Docker volume, or a folder on your computer set in \`.env\`:

  \`\`\`bash
  SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
  docker compose up -d sdr
  \`\`\`

  On Linux also set \`SENTINEL_RUNTIME_USER_ID\` / \`_GROUP_ID\` to your ids so the files are yours.
- **Folder**: **Recordings Folder** picks a subfolder inside the root. It must stay inside it.

Changing either affects new recordings only; old ones stay where they are.

## Settings

All in **Settings › SDR › SDR Options**.

| Setting | What it does |
|---|---|
| **Record Raw IQ with Recordings (Large Files)** | Also save raw IQ. Off by default |
| **Max Recording Length (Minutes)** | Safety stop. Default 360 |
| **Recordings Folder** | Subfolder for new recordings |

> [!WARNING]
> Raw IQ is about 250 MB a minute. Turn it on only when you need it.

## If it's not working

- **Record greyed out:** nothing is playing. Press **Tune** first.
- **Stuck on COPYING IQ…:** the radio hub is down; it retries every minute. \`docker compose ps radio\`.
- **Recording missing:** the root moved. Copy old files across, keeping their subfolders.
- **Marked failed:** it ran past **Max Recording Length**, usually after the browser closed.
`,dr=`# Sea

Live ships near you, from AIS. Online from [AISStream](https://aisstream.io) (free key); off grid from your own radio.

## Features

- **Live map** of ships, coloured by type, moved smoothly along their course between reports.
- **Ship details**: name, type, MMSI, IMO, callsign, status, destination, speed, course, heading, and recent track.
- **Search** by name, MMSI, type or destination in **FILTER**; show one ship type at a time.
- **Ports** layer: select a port for its VHF channels, then a channel to tune your radio.
- **Layers**: vessel labels, range rings, ferry routes, ports.
- **Coverage area**: receive the whole world or only your area.

Ships not heard for 30 minutes leave the map.

![A ship's details in the FILTER pane, grouped as VESSEL, VOYAGE, POSITION and MOVEMENT, with labelled ships on the map.](../images/sea-vessel-details.png)

## Add your AISStream key

1. **Settings › SEA › AIS Data API Key › GET AIS API KEY** (opens AISStream).
2. Sign in there and create a key.
3. Paste it into **API KEY**, then **APPLY CHANGES**.

Ships appear within a minute. The key never appears in the config file or exports. **FORGET KEY** removes it.

> [!IMPORTANT]
> One connection per key. Use each key in one Sentinel only, or both lose the feed and the key can be locked out.

## Off grid

You need a dongle you can give to AIS full time and a marine VHF antenna (about 162 MHz), mounted high.

1. \`docker compose --profile ais up -d --build\`
2. **Settings › SEA › Off Grid AIS SDR**: pick the radio.
3. Set **OFF GRID** (app-wide, or Sea's **Source Override**), then **APPLY CHANGES**.

The decoder keeps the radio on both AIS channels and runs in the background, even with no browser open.

## Settings

All in **Settings › SEA**.

| Setting | What it does |
|---|---|
| **Source Override** | **ONLINE** or **OFF GRID** for Sea only |
| **Off Grid AIS SDR** | The radio used off grid |
| **Online Data Source** | The AISStream address |
| **AIS Data API Key** | Your AISStream key |
| **Coverage Area** | **WORLDWIDE**, **USE CURRENT MAP VIEW**, or edges |
| **Map Layers** | Layers on when the map opens |
| **Vessel Label Fields** | What each ship label shows |

## Tips

- On a small computer, shrink **Coverage Area**: worldwide is hundreds of messages a second.
- AIS is line of sight. Height beats everything.

## If it's not working

Read the notice at the top of the map:

- **"No AISStream API key configured":** add your key.
- **"AISStream rejected the API key":** check it. A rejected key is retried hourly, or at once when changed.
- **"No off-grid AIS receiver selected":** set **Off Grid AIS SDR**.
- **"The AIS decoder is not running":** \`docker compose --profile ais up -d\`.
- **"Tuned away from the AIS channels":** it retunes itself within about 15 seconds.
`,fr=`# Settings and the config file

Every setting is in **Settings** (the gear, bottom right) and in one live file, \`backend/data/sentinel_config.json\`.

## Features

- **One page per section**, each with its own address such as \`/settings/sea\`.
- **SEARCH SETTINGS** finds any setting by name or description.
- **Doc links** beside a setting open its page here.
- **APPLY CHANGES** saves everything at once and updates every browser in place, with no reload. **NO CHANGES** means nothing was changed.
- **Shared**: settings live on the Sentinel computer, so every device sees the same.
- **Connectivity Mode**: **ONLINE** or **OFF GRID** for every section; Air and Sea also have a **Source Override**.
- **Export All Configuration**: settings, frequencies and band plan as three files.
- **Application Config**: view, **EDIT** or **EXPORT** the config file in the browser.

![Settings › App Settings: the Settings menu down the left, SEARCH SETTINGS at the top, Connectivity Mode and Alert Sound, and APPLY CHANGES at the bottom right.](../images/settings-app.png)

## Things to know

- Changes wait for **APPLY CHANGES**. Leaving the page without it throws them away.
- These act at once: **UPDATE TLE**, adding or removing a radio or Sentry host, **DOWNLOAD**, **EXPORT**.
- Choosing **Connectivity Mode** resets every **Source Override**.

## The config file

A live, two-way copy of every setting.

- Sentinel rewrites it within a second of any change.
- Save an edit and Sentinel applies it within a second or two; browsers update in place.
- An invalid file is ignored and logged (\`docker compose logs app\`); fix it before the next change overwrites it.
- In **Application Config › EDIT**, you can send only the keys you want to change. A nested value (such as \`location\`) is replaced whole.

\`\`\`json
{
  "app": {
    "location": { "latitude": 51.5072, "longitude": -0.1276 },
    "connectivityMode": "offgrid"
  },
  "land": { "enabled": true, "aprsChannelHz": 144390000 },
  "sea": { "aisBoundingBoxes": [[[49.5, -11.0], [61.0, 2.5]]] }
}
\`\`\`

| Key | Values |
|---|---|
| \`app.connectivityMode\`, \`<section>.sourceOverride\` | \`"online"\` or \`"offgrid"\` |
| \`app.location\` | \`latitude\` and \`longitude\`, both set or both empty |
| \`app.mapTheme\` | \`"dark"\` or \`"light"\` |
| \`<section>.enabled\` | \`true\` or \`false\` |
| \`sea.aisBoundingBoxes\` | Boxes of \`[[south, west], [north, east]]\` |
| \`sea.aisSdrRadioId\`, \`sdr.aprs_radio_id\`, \`air.offgridSdrSource\` | A radio \`id\` from \`sdr.radios\`, or \`null\` |
| \`sdr.radios\` | The radio list; sending it replaces the whole list |

The full defaults are in \`backend/default_config.json\`.

## Not in the file

- The AISStream key (set it on each Sentinel).
- Saved frequencies, groups, ranges, band plan and satellite frequencies: each has its own JSON editor in Settings.
- \`.env\` settings: see [Environment variables](../configuration.md).

## Copy settings to another Sentinel

**EXPORT** on the first, then on the second paste it into **Application Config › EDIT** and **APPLY CHANGES** (or replace its file).
`,pr=`# Space

Satellites on a globe, and when they pass over you. Positions are worked out on your computer from TLEs (orbit data), so Space works offline once they are loaded.

## Features

- **Find a satellite** by name, NORAD ID or category in **FILTER**.
- **Satellite details**: ground track for the next orbits, footprint, radio frequencies and upcoming passes.
- **Track satellite**: keep the map on it; listed under **TRACKING**.
- **PASSES** pane: the next passes over you, soonest first, with rise time, highest elevation and length. Select one for its sky plot.
- **Pass alerts**: about five minutes before it rises (the bell on a pass).
- **Auto-tune SDR**: your radio tunes to the downlink at rise and goes back at set.
- **Record pass**: records while auto-tuned.
- **DAY / NIGHT** shading and **LOCATION NAMES**.

![The SPACE map zoomed out: the ISS (ZARYA) over Morocco with its visibility footprint as a circle, its ground track over the next orbits as curved lines across the Americas, Europe and Asia, and the Sentinel Location marked over the UK.](../images/space-iss.png)

![The PASSES pane: three upcoming passes, soonest first, each with its rise time, length and highest elevation, and category buttons above to filter them.](../images/space-passes.png)

## Load satellites

**Settings › SPACE › Online Data Source**: pick categories, then **UPDATE TLE**.

With no internet, use **TLE Import**: a \`.txt\` file, three lines per satellite (name, then the two element lines).

## Catch and record a pass

1. Set **Sentinel Location** and [add a radio](sdr/add-a-radio.md).
2. In **PASSES**, on the pass: turn on **Auto-tune SDR**, then **Record pass**.
3. Leave Sentinel open in a browser tab. The browser does the tuning.

The recording appears in SDR's **RECORDINGS**.

## Settings

All in **Settings › SPACE**.

| Setting | What it does |
|---|---|
| **Online Data Source** | TLE categories to download; **UPDATE TLE** |
| **TLE Import** | Load TLEs from a \`.txt\` file |
| **TLE Database** | What is stored; clear one category or all |
| **Satellite Frequencies (JSON)** | Downlinks used by auto-tune |
| **Filter Hover Behaviour** | Whether hovering a satellite in **FILTER** moves the map |

## Tips

- Higher maximum elevation means a clearer signal.
- TLEs drift a few kilometres a day: update weekly, and before going off grid.

## If it's not working

- **"No satellite data available":** load TLEs.
- **No auto-tune on a satellite:** add its downlink to **Satellite Frequencies (JSON)**.
- **Pass came and went, nothing tuned:** no browser had Sentinel open, no radio was connected, or a decoder holds the radio.
`,mr=`/spa-assets/air-aircraft-details-iB2NWeGE.png`,hr=`/spa-assets/alerts-pane-DuB8gPCX.png`,gr=`/spa-assets/interface-air-screen-ChD1zeql.png`,_r=`/spa-assets/interface-phone-Bcpufd12.png`,vr=`/spa-assets/land-repeater-details-rTqp4UOm.png`,yr=`/spa-assets/sdr-radio-panel-D5OzAFqK.png`,br=`/spa-assets/sea-vessel-details-CTc6hVMy.png`,xr=`/spa-assets/settings-add-radio-DW5NHexh.png`,Sr=`/spa-assets/settings-app-JaswzW3B.png`,Cr=`/spa-assets/settings-offline-maps-OzRHYLVe.png`,wr=`/spa-assets/settings-sdr-HGQ2IhUL.png`,Tr=`/spa-assets/settings-sea-ePq2KPox.png`,Er=`/spa-assets/space-iss-CL8Vceu8.png`,Dr=`/spa-assets/space-passes-C7M9QQ3Y.png`,Or={groups:[{key:`get-started`,title:`Get started`,pages:[{path:`index`,title:`Welcome to Sentinel`},{path:`install`,title:`Quick start`},{path:`use/interface`,title:`The screen`},{path:`reference/glossary`,title:`Glossary`}]},{key:`app`,title:`App-wide`,pages:[{path:`use/alerts`,title:`Alerts`},{path:`use/maps`,title:`Maps`},{path:`use/settings`,title:`Settings and the config file`},{path:`use/off-grid`,title:`Off grid`},{path:`use/receiving-responsibly`,title:`Receiving responsibly`}]},{key:`air`,title:`Air`,pages:[{path:`use/air`,title:`Air: aircraft`}]},{key:`space`,title:`Space`,pages:[{path:`use/space`,title:`Space: satellites`}]},{key:`sea`,title:`Sea`,pages:[{path:`use/sea`,title:`Sea: ships`}]},{key:`land`,title:`Land`,pages:[{path:`use/land`,title:`Land: repeaters and APRS`}]},{key:`sdr`,title:`SDR`,pages:[{path:`use/sdr/add-a-radio`,title:`Radios`},{path:`use/sdr/listen`,title:`Listen`},{path:`use/sdr/frequencies`,title:`Frequencies and scanning`},{path:`use/sdr/record`,title:`Record`},{path:`use/sdr/decode`,title:`Decode`}]},{key:`set-up-and-run`,title:`Set up and run`,pages:[{path:`configuration`,title:`Environment variables (.env)`},{path:`hardware`,title:`Hardware`},{path:`decoders`,title:`Decoders`},{path:`radio-host`,title:`Radio host`},{path:`operations`,title:`Run and maintain`},{path:`reference/ports-and-services`,title:`Ports and services`},{path:`troubleshooting`,title:`Troubleshooting`},{path:`upgrading`,title:`Upgrade`}]},{key:`develop`,title:`Developer docs`,pages:[{path:`architecture/overview`,title:`How it works`},{path:`architecture/data-flows`,title:`Data flows`},{path:`architecture/radios`,title:`Radios and decoding`},{path:`architecture/storage`,title:`Storage and caching`},{path:`architecture/bus-and-security`,title:`Event bus and security`},{path:`development/setup`,title:`Set up for development`},{path:`development/code-map`,title:`Code map`},{path:`development/testing`,title:`Testing`},{path:`development/how-to`,title:`How to…`},{path:`contributing`,title:`Contributing`,file:`CONTRIBUTING.md`},{title:`Design decisions`,pages:[{path:`adr/0006-section-containers`,title:`0006 Section containers`},{path:`adr/0005-sea-ais-vessel-tracking`,title:`0005 Sea AIS vessel tracking`},{path:`adr/0004-remove-trunk-tracking`,title:`0004 Remove trunk tracking`},{path:`adr/0003-sentry-sdr-lock-and-tune`,title:`0003 Sentry SDR lock and tune`},{path:`adr/0002-base-component-dedupe`,title:`0002 Shared base components`},{path:`adr/0001-webapp-standards-retrofit`,title:`0001 Retrofit to the webapp standards`}]}]}],synonyms:{plane:[`Air`,`aircraft`,`ADS-B`],planes:[`Air`,`aircraft`,`ADS-B`],aeroplane:[`Air`,`aircraft`,`ADS-B`],aircraft:[`Air`,`ADS-B`],flight:[`Air`,`aircraft`,`ADS-B`],ship:[`Sea`,`vessel`,`AIS`],ships:[`Sea`,`vessel`,`AIS`],boat:[`Sea`,`vessel`,`AIS`],vessel:[`Sea`,`AIS`],satellite:[`Space`,`orbit`,`pass`],satellites:[`Space`,`orbit`,`pass`],ham:[`Land`,`SDR`,`APRS`],radio:[`SDR`,`rtl_tcp`,`dongle`],dongle:[`SDR`,`rtl_tcp`,`radio`],offline:[`Off Grid`,`tiles`,`pmtiles`],map:[`tiles`,`pmtiles`],password:[`credentials`,`secret`],env:[`environment`,`configuration`],scanner:[`SDR`,`scan`,`search`],repeater:[`Land`,`repeaters`],record:[`recording`,`recordings`],recording:[`record`,`recordings`],emergency:[`squawk`,`7700`],squawk:[`emergency`,`Air`],internet:[`Off Grid`,`offline`],docker:[`compose`,`container`,`volume`],database:[`SQLite`,`databases`,`db`],architecture:[`overview`,`how it works`],nats:[`event bus`],caddy:[`gateway`]}},kr=Object.assign({"../../../../CONTRIBUTING.md":En,"../../../../docs/adr/0001-webapp-standards-retrofit.md":Dn,"../../../../docs/adr/0002-base-component-dedupe.md":On,"../../../../docs/adr/0003-sentry-sdr-lock-and-tune.md":kn,"../../../../docs/adr/0004-remove-trunk-tracking.md":An,"../../../../docs/adr/0005-sea-ais-vessel-tracking.md":jn,"../../../../docs/adr/0006-section-containers.md":Mn,"../../../../docs/architecture/bus-and-security.md":Nn,"../../../../docs/architecture/data-flows.md":Pn,"../../../../docs/architecture/overview.md":Fn,"../../../../docs/architecture/radios.md":In,"../../../../docs/architecture/storage.md":Ln,"../../../../docs/configuration.md":Rn,"../../../../docs/decoders.md":zn,"../../../../docs/development/code-map.md":Bn,"../../../../docs/development/how-to.md":Vn,"../../../../docs/development/setup.md":Hn,"../../../../docs/development/testing.md":Un,"../../../../docs/hardware.md":Wn,"../../../../docs/index.md":Gn,"../../../../docs/install.md":Kn,"../../../../docs/operations.md":qn,"../../../../docs/radio-host.md":Jn,"../../../../docs/reference/glossary.md":Yn,"../../../../docs/reference/ports-and-services.md":Xn,"../../../../docs/troubleshooting.md":Zn,"../../../../docs/upgrading.md":Qn,"../../../../docs/use/air.md":$n,"../../../../docs/use/alerts.md":er,"../../../../docs/use/interface.md":tr,"../../../../docs/use/land.md":nr,"../../../../docs/use/maps.md":rr,"../../../../docs/use/off-grid.md":ir,"../../../../docs/use/receiving-responsibly.md":ar,"../../../../docs/use/sdr/add-a-radio.md":or,"../../../../docs/use/sdr/decode.md":sr,"../../../../docs/use/sdr/frequencies.md":cr,"../../../../docs/use/sdr/listen.md":lr,"../../../../docs/use/sdr/record.md":ur,"../../../../docs/use/sea.md":dr,"../../../../docs/use/settings.md":fr,"../../../../docs/use/space.md":pr}),Ar=Object.assign({"../../../../docs/images/air-aircraft-details.png":mr,"../../../../docs/images/alerts-pane.png":hr,"../../../../docs/images/interface-air-screen.png":gr,"../../../../docs/images/interface-phone.png":_r,"../../../../docs/images/land-repeater-details.png":vr,"../../../../docs/images/sdr-radio-panel.png":yr,"../../../../docs/images/sea-vessel-details.png":br,"../../../../docs/images/settings-add-radio.png":xr,"../../../../docs/images/settings-app.png":Sr,"../../../../docs/images/settings-offline-maps.png":Cr,"../../../../docs/images/settings-sdr.png":wr,"../../../../docs/images/settings-sea.png":Tr,"../../../../docs/images/space-iss.png":Er,"../../../../docs/images/space-passes.png":Dr});function jr(e){return Object.fromEntries(Object.entries(e).map(([e,t])=>[bn(e),t]))}var Mr=jr(Ar),Nr;function Pr(){return Nr??=wn(Or,jr(kr)),Nr}function Fr(){let e=te(),t=D(),n=Pr(),r=p(()=>yn(me(e))),i=p(()=>n.pageByPath.get(r.value)),a=p(()=>n.groups.find(e=>e.key===i.value?.groupKey)),o=p(()=>typeof e.query.q==`string`?e.query.q:``),s=p(()=>o.value.trim().length>=2),c=p(()=>{let t=e.hash.replace(/^#/,``);try{return decodeURIComponent(t)}catch{return t}});function l(n){let{q:r,...i}=e.query;t.replace({path:e.path,query:n===``?i:{...i,q:n},hash:e.hash})}return{library:n,pagePath:r,page:i,activeGroup:a,query:o,searchActive:s,hashId:c,setQuery:l}}function Ir(e,t){let n=A(),i;r(e,e=>{clearTimeout(i),!(!e||!t.value)&&(i=setTimeout(()=>{let t=e.totalHits;n.announce(t===0?`No results`:`${t} ${t===1?`result`:`results`}`)},500))},{immediate:!0}),S(()=>clearTimeout(i))}var Lr={};function Rr(e){let t=Lr[e];if(t)return t;t=Lr[e]=[];for(let e=0;e<128;e++){let n=String.fromCharCode(e);t.push(n)}for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);t[r]=`%`+(`0`+r.toString(16).toUpperCase()).slice(-2)}return t}function N(e,t){typeof t!=`string`&&(t=N.defaultChars);let n=Rr(t);return e.replace(/(%[a-f0-9]{2})+/gi,function(e){let t=``;for(let r=0,i=e.length;r<i;r+=3){let a=parseInt(e.slice(r+1,r+3),16);if(a<128){t+=n[a];continue}if((a&224)==192&&r+3<i){let n=parseInt(e.slice(r+4,r+6),16);if((n&192)==128){let e=a<<6&1984|n&63;e<128?t+=`��`:t+=String.fromCharCode(e),r+=3;continue}}if((a&240)==224&&r+6<i){let n=parseInt(e.slice(r+4,r+6),16),i=parseInt(e.slice(r+7,r+9),16);if((n&192)==128&&(i&192)==128){let e=a<<12&61440|n<<6&4032|i&63;e<2048||e>=55296&&e<=57343?t+=`���`:t+=String.fromCharCode(e),r+=6;continue}}if((a&248)==240&&r+9<i){let n=parseInt(e.slice(r+4,r+6),16),i=parseInt(e.slice(r+7,r+9),16),o=parseInt(e.slice(r+10,r+12),16);if((n&192)==128&&(i&192)==128&&(o&192)==128){let e=a<<18&1835008|n<<12&258048|i<<6&4032|o&63;e<65536||e>1114111?t+=`����`:(e-=65536,t+=String.fromCharCode(55296+(e>>10),56320+(e&1023))),r+=9;continue}}t+=`�`}return t})}N.defaultChars=`;/?:@&=+$,#`,N.componentChars=``;var zr={};function Br(e){let t=zr[e];if(t)return t;t=zr[e]=[];for(let e=0;e<128;e++){let n=String.fromCharCode(e);/^[0-9a-z]$/i.test(n)?t.push(n):t.push(`%`+(`0`+e.toString(16).toUpperCase()).slice(-2))}for(let n=0;n<e.length;n++)t[e.charCodeAt(n)]=e[n];return t}function P(e,t,n){typeof t!=`string`&&(n=t,t=P.defaultChars),n===void 0&&(n=!0);let r=Br(t),i=``;for(let t=0,a=e.length;t<a;t++){let o=e.charCodeAt(t);if(n&&o===37&&t+2<a&&/^[0-9a-f]{2}$/i.test(e.slice(t+1,t+3))){i+=e.slice(t,t+3),t+=2;continue}if(o<128){i+=r[o];continue}if(o>=55296&&o<=57343){if(o>=55296&&o<=56319&&t+1<a){let n=e.charCodeAt(t+1);if(n>=56320&&n<=57343){i+=encodeURIComponent(e[t]+e[t+1]),t++;continue}}i+=`%EF%BF%BD`;continue}i+=encodeURIComponent(e[t])}return i}P.defaultChars=`;/?:@&=+$,-_.!~*'()#`,P.componentChars=`-_.!~*'()`;function Vr(e){let t=``;return t+=e.protocol||``,t+=e.slashes?`//`:``,t+=e.auth?e.auth+`@`:``,e.hostname&&e.hostname.indexOf(`:`)!==-1?t+=`[`+e.hostname+`]`:t+=e.hostname||``,t+=e.port?`:`+e.port:``,t+=e.pathname||``,t+=e.search||``,t+=e.hash||``,t}function Hr(){this.protocol=null,this.slashes=null,this.auth=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.pathname=null}var Ur=/^([a-z0-9.+-]+:)/i,Wr=/:[0-9]*$/,Gr=/^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,Kr=[`%`,`/`,`?`,`;`,`#`,`'`,`{`,`}`,`|`,`\\`,`^`,"`",`<`,`>`,`"`,"`",` `,`\r`,`
`,`	`],qr=[`/`,`?`,`#`],Jr=255,Yr=/^[+a-z0-9A-Z_-]{0,63}$/,Xr=/^([+a-z0-9A-Z_-]{0,63})(.*)$/,Zr={javascript:!0,"javascript:":!0},Qr={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0};function $r(e,t){if(e&&e instanceof Hr)return e;let n=new Hr;return n.parse(e,t),n}Hr.prototype.parse=function(e,t){let n,r,i,a=e;if(a=a.trim(),!t&&e.split(`#`).length===1){let e=Gr.exec(a);if(e)return this.pathname=e[1],e[2]&&(this.search=e[2]),this}let o=Ur.exec(a);if(o&&(o=o[0],n=o.toLowerCase(),this.protocol=o,a=a.substr(o.length)),(t||o||a.match(/^\/\/[^@\/]+@[^@\/]+/))&&(i=a.substr(0,2)===`//`,i&&!(o&&Zr[o])&&(a=a.substr(2),this.slashes=!0)),!Zr[o]&&(i||o&&!Qr[o])){let e=-1;for(let t=0;t<qr.length;t++)r=a.indexOf(qr[t]),r!==-1&&(e===-1||r<e)&&(e=r);let t,n;n=e===-1?a.lastIndexOf(`@`):a.lastIndexOf(`@`,e),n!==-1&&(t=a.slice(0,n),a=a.slice(n+1),this.auth=t),e=-1;for(let t=0;t<Kr.length;t++)r=a.indexOf(Kr[t]),r!==-1&&(e===-1||r<e)&&(e=r);e===-1&&(e=a.length),a[e-1]===`:`&&e--;let i=a.slice(0,e);a=a.slice(e),this.parseHost(i),this.hostname=this.hostname||``;let o=this.hostname[0]===`[`&&this.hostname[this.hostname.length-1]===`]`;if(!o){let e=this.hostname.split(/\./);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n&&!n.match(Yr)){let r=``;for(let e=0,t=n.length;e<t;e++)n.charCodeAt(e)>127?r+=`x`:r+=n[e];if(!r.match(Yr)){let r=e.slice(0,t),i=e.slice(t+1),o=n.match(Xr);o&&(r.push(o[1]),i.unshift(o[2])),i.length&&(a=i.join(`.`)+a),this.hostname=r.join(`.`);break}}}}this.hostname.length>Jr&&(this.hostname=``),o&&(this.hostname=this.hostname.substr(1,this.hostname.length-2))}let s=a.indexOf(`#`);s!==-1&&(this.hash=a.substr(s),a=a.slice(0,s));let c=a.indexOf(`?`);return c!==-1&&(this.search=a.substr(c),a=a.slice(0,c)),a&&(this.pathname=a),Qr[n]&&this.hostname&&!this.pathname&&(this.pathname=``),this},Hr.prototype.parseHost=function(e){let t=Wr.exec(e);t&&(t=t[0],t!==`:`&&(this.port=t.substr(1)),e=e.substr(0,e.length-t.length)),e&&(this.hostname=e)};var ei=e({decode:()=>N,encode:()=>P,format:()=>Vr,parse:()=>$r}),ti=e({Any:()=>ni,Cc:()=>ri,Cf:()=>ii,P:()=>ai,S:()=>oi,Z:()=>si}),ni=/[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,ri=/[\0-\x1F\x7F-\x9F]/,ii=/[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/,ai=/[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B4E\u1B4F\u1B5A-\u1B60\u1B7D-\u1B7F\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDD6E\uDEAD\uDED0\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9\uDFD4\uDFD5\uDFD7\uDFD8]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09\uDFE1]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDD6D-\uDD6F\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD839\uDDFF|\uD83A[\uDD5E\uDD5F]/,oi=/[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C1\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2429\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E5\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD803[\uDD8E\uDD8F\uDED1-\uDED8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDC00-\uDCEF\uDCFA-\uDCFC\uDD00-\uDEB3\uDEBA-\uDED0\uDEE0-\uDEF0\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED8\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0-\uDCBB\uDCC0\uDCC1\uDCD0-\uDCD8\uDD00-\uDE57\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF-\uDEF8\uDF00-\uDF92\uDF94-\uDFEF\uDFFA]/,si=/[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/,ci=[8364,0,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,0,381,0,0,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,0,382,376];function li(e){return e===0||e>=55296&&e<=57343||e>1114111}function ui(e){return li(e)?65533:e>=128&&e<=159&&ci[e-128]||e}function di(e){return e-1>>>0<127||e-160>>>0<55136?String.fromCharCode(e):String.fromCodePoint(ui(e))}var F=(()=>{let e=new Uint8Array(127),t=0;for(let n=33;n<=126;n++)n!==34&&n!==36&&n!==92&&(e[n]=t++);return e})();function fi(e,t,n,r,i,a){let o=e.length,s=a*90,c=0,l=()=>{let t=F[e.charCodeAt(c++)];return t<a?t:t*91-s+F[e.charCodeAt(c++)]},u=n-r,d=n+i,f=new Int32Array(d);f.fill(-1,r,a),f.fill(-1,a+u,d);let p=new Int32Array(d),m=new Int32Array(d);function h(t,n){let r=0,i=n,a=n+t;for(;i<a;){let t=F[e.charCodeAt(c++)];if(t<89)r+=t,f[i++]=r;else if(t===89){let t=F[e.charCodeAt(c++)]+2;for(;t--;)f[i++]=++r}else{let t=F[e.charCodeAt(c++)];r+=89+(t<90?t*91+F[e.charCodeAt(c++)]:F[e.charCodeAt(c++)]*8281+F[e.charCodeAt(c++)]*91+F[e.charCodeAt(c++)]),f[i++]=r}}}h(r,0),h(u,a);let g=new Int32Array(i*2),_=0,v=0;function y(e,t){for(let n=0;n<e;n++){let e=t+n,r=l(),i=l();g[v*2]=r,g[v*2+1]=i,v+=1,p[e]=_;let a=(f[r]<0?m[r]:1)+(f[i]<0?m[i]:1);m[e]=a,_+=a}}y(i-a+r,a+u),y(a-r,r);let b=new Uint16Array(_),x=0;for(let e=0;e<v;e++)for(let t=0;t<2;t++){let n=g[e*2+t],r=f[n];if(r<0){let e=p[n],t=e+m[n];for(;e<t;)b[x++]=b[e++]}else b[x++]=r}let S=new Uint16Array(t),C=0;for(;c<o;){let t=F[e.charCodeAt(c++)];t>=a&&(t=t*91-s+F[e.charCodeAt(c++)]);let n=f[t];if(n<0){let e=p[t],n=e+m[t];for(;e<n;)S[C++]=b[e++]}else S[C++]=n}return S}var pi=fi("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P",13494,2713,49,25,61),I;(function(e){e[e.VALUE_LENGTH=49152]=`VALUE_LENGTH`,e[e.FLAG13=8192]=`FLAG13`,e[e.BRANCH_LENGTH=8064]=`BRANCH_LENGTH`,e[e.JUMP_TABLE=127]=`JUMP_TABLE`,e[e.VALUE_MASK=8191]=`VALUE_MASK`})(I||={});var L;(function(e){e[e.AMP=38]=`AMP`,e[e.NUM=35]=`NUM`,e[e.SEMI=59]=`SEMI`,e[e.EQUALS=61]=`EQUALS`,e[e.ZERO=48]=`ZERO`,e[e.NINE=57]=`NINE`,e[e.LOWER_A=97]=`LOWER_A`,e[e.LOWER_X=120]=`LOWER_X`})(L||={});var mi=32,hi=21,gi=2097151,_i=2047,vi=0;function yi(e){let t=e>>>hi;return t===_i?vi:t}function bi(e){return e-L.ZERO>>>0<=9}function xi(e){return(e|mi)-L.LOWER_A>>>0<=5}function Si(e){return(e|mi)-L.LOWER_A>>>0<=25}function Ci(e){return e===L.EQUALS||Si(e)||bi(e)}var wi;(function(e){e[e.EntityStart=0]=`EntityStart`,e[e.NumericStart=1]=`NumericStart`,e[e.NumericDecimal=2]=`NumericDecimal`,e[e.NumericHex=3]=`NumericHex`,e[e.NamedEntity=4]=`NamedEntity`})(wi||={});var Ti;(function(e){e[e.Legacy=0]=`Legacy`,e[e.Strict=1]=`Strict`,e[e.Attribute=2]=`Attribute`})(Ti||={});function Ei(e,t,n,r){let i=(t&I.BRANCH_LENGTH)>>7,a=t&I.JUMP_TABLE;if(a){if(i===0)return r===a?n:-1;let t=r-a;if(t>>>0>=i)return-1;let o=e[n+t];return o===0?-1:n+i+o-1&65535}if(i===0)return-1;let o=i+1>>1,s=n+o+i;for(let t=0;t<i;t++){let i=e[n+(t>>1)]>>((t&1)<<3)&255;if(i===r)return s+e[n+o+t]&65535;if(i>r)return-1}return-1}function Di(e,t,n){return n===1?String.fromCharCode(e[t]&I.VALUE_MASK):n===2?String.fromCharCode(e[t+1]):String.fromCharCode(e[t+1],e[t+2])}function Oi(e,t,n){let r=t+1,i=0,a=r;if(r<n&&(e.charCodeAt(r)|mi)===L.LOWER_X)for(r+=1,a=r;r<n;){let t=e.charCodeAt(r);if(bi(t))i=i*16+(t-L.ZERO);else if(xi(t))i=i*16+((t|mi)-L.LOWER_A+10);else break;r+=1}else for(;r<n;){let t=e.charCodeAt(r)-L.ZERO;if(t>>>0>9)break;i=i*10+t,r+=1}if(r===a)return 0;r<n&&e.charCodeAt(r)===L.SEMI&&(r+=1),i>1114111&&(i=1114112);let o=r-t;return o>=_i&&(vi=o,o=_i),o<<hi|i}function ki(e,t,n){let r=pi,i=e.indexOf(`&`);if(i<0)return e;let a=e.length,o=0,s=``,c=r[0],l=c&I.JUMP_TABLE,u=(c&I.BRANCH_LENGTH)>>7;do{let c=i+1,d=e.charCodeAt(c),f,p;if(d===L.NUM){let n=Oi(e,c,a);f=yi(n),t&&f>0&&e.charCodeAt(c+f-1)!==L.SEMI&&(f=0),p=f===0?``:di(n&gi)}else if(Si(d)){f=0,p=``;let n=d-l,i;if(n>>>0<u){let e=r[1+n];i=e===0?-1:u+e&65535}else i=-1;let o=0,s=0,m=i<0?0:r[i],h=c+1;trie:for(;h<a;){for(;(m&(I.VALUE_LENGTH|I.FLAG13))===0&&(m&I.JUMP_TABLE)!==0;){let t=m&I.JUMP_TABLE,n=(m&I.BRANCH_LENGTH)>>7;if(n===0){if(e.charCodeAt(h)!==t)break trie;i+=1}else{let a=e.charCodeAt(h)-t;if(a>>>0>=n)break trie;let o=r[i+1+a];if(o===0)break trie;i=i+n+o&65535}if(m=r[i],h+=1,h>=a)break trie}if((m&(I.VALUE_LENGTH|I.FLAG13))===I.FLAG13){let t=(m&I.BRANCH_LENGTH)>>7;if(e.charCodeAt(h)!==(m&I.JUMP_TABLE))break;h+=1;let n=t-1,a=i+1,o=0;for(;o+1<n;o+=2){let t=r[a];if(e.charCodeAt(h)!==(t&255)||(h+=1,e.charCodeAt(h)!==(t>>8&255)))break trie;h+=1,a+=1}if(o<n){if(e.charCodeAt(h)!==(r[a]&255))break;h+=1}i+=1+(t>>1),m=r[i];continue}let n=m>>>14,l=e.charCodeAt(h);if(n!==0){if(l===L.SEMI){f=h-c+1,p=n===1?String.fromCharCode(m&I.VALUE_MASK):Di(r,i,n);break}if(!t&&(m&I.FLAG13)===0&&(f=h-c,o=i,s=n),n===1)break}let u=Ei(r,m,i+(n||1),l);if(u<0)break;i=u,m=r[i],h+=1}if(p===``){let e=m>>>14;e!==0&&!t&&(m&I.FLAG13)===0&&(f=h-c,o=i,s=e),f>0&&(p=Di(r,o,s))}}else f=0,p=``;f===0||n&&d!==L.NUM&&e.charCodeAt(c+f-1)!==L.SEMI&&c+f<a&&Ci(e.charCodeAt(c+f))?i=c:(o<i&&(s+=e.slice(o,i)),s+=p,i=o=c+f),e.charCodeAt(i)!==L.AMP&&(i=e.indexOf(`&`,i))}while(i>=0);return s+e.slice(o)}function Ai(e){return ki(e,!0,!1)}var ji=class{src_Any=ni.source;src_Cc=ri.source;src_Z=si.source;src_P=ai.source;src_ZPCc=[this.src_Z,this.src_P,this.src_Cc].join(`|`);src_ZCc=[this.src_Z,this.src_Cc].join(`|`);cache={};opts={maxLength:1e4,urlAuth:!1,schema_names:[]};constructor(e={}){this.opts={...this.opts,...e}}set(e={}){return this.opts={...this.opts,...e},this.cache={},this}escapeRE(e){return e.replace(/[.?*+^$[\]\\(){}|-]/g,`\\$&`)}nestedPairRE(e,t,n=4){let r=this.escapeRE(e),i=this.escapeRE(t),a=`(?:(?!${this.src_ZCc}|${r}|${i}).)`,o=`${r}${a}{0,1000}${i}`;for(let e=2;e<=n;e++)o=`${r}(?:${a}|${o}){0,1000}${i}`;return o}get_text_separators(){return this.cache.text_separators??=/[><\uff5c]/}get_pseudo_letter(){return this.cache.src_pseudo_letter??=RegExp(`(?:(?!${this.get_text_separators().source}|${this.src_ZPCc})${this.src_Any})`)}get_ipv4_addr(){return this.cache.src_ip4??=RegExp(`(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])[.]){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])`)}get_ipv6_addr(){let e=`[0-9A-Fa-f]{1,4}`,t=`(?:(?:${e}:${e})|${this.get_ipv4_addr().source})`;return this.cache.src_ip6_addr??=RegExp(`(?:(?:${e}:){6}${t}|::(?:${e}:){5}${t}|(?:${e})?::(?:${e}:){4}${t}|(?:(?:${e}:){0,1}${e})?::(?:${e}:){3}${t}|(?:(?:${e}:){0,2}${e})?::(?:${e}:){2}${t}|(?:(?:${e}:){0,3}${e})?::${e}:${t}|(?:(?:${e}:){0,4}${e})?::${t}|(?:(?:${e}:){0,5}${e})?::${e}|(?:(?:${e}:){0,6}${e})?::)`)}get_ipv6_url_host(){return this.cache.src_ip6_host??=RegExp(`\\[${this.get_ipv6_addr().source}\\]`)}get_ipv6_mail_host(){return this.cache.src_ipv6_mail_host??=RegExp(`\\[IPv6:${this.get_ipv6_addr().source}\\]`)}get_auth(){return this.cache.src_auth??=RegExp(`(?:(?:(?!${this.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`)}get_port(){return this.cache.src_port??=RegExp(`(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?`)}get_host_terminator(){return this.cache.src_host_terminator??=RegExp(`(?=$|${this.get_text_separators().source}|${this.src_ZPCc})(?!${this.opts[`---`]?`-(?!--)|`:`-|`}_|:\\d|\\.-|\\.(?!$|${this.src_ZPCc}))`)}get_path_terminator(){return this.cache.src_path_terminator??=RegExp(`${this.src_ZPCc}|${this.get_text_separators().source}`)}get_path(){return this.cache.src_path??=RegExp(`(?:[/?#](?:${this.nestedPairRE(`[`,`]`)}|${this.nestedPairRE(`(`,`)`)}|${this.nestedPairRE(`{`,`}`)}|\\"(?:(?!${this.src_ZCc}|["]).){1,100}\\"|\\'(?:(?!${this.src_ZCc}|[']).){1,100}\\'|\\'(?=${this.get_pseudo_letter().source}|[-])|\\.{2,20}[:]?[a-zA-Z0-9%/&]|\\.(?!${this.src_ZCc}|[.]|$)|`+(this.opts[`---`]?`\\-(?!--(?:[^-]|$))(?:-{0,19})|`:`\\-{1,20}|`)+`,(?!${this.src_ZCc}|$)|;(?!${this.src_ZCc}|$)|\\!{1,20}(?!${this.src_ZCc}|[!]|$)|\\?(?!${this.src_ZCc}|[?]|$)|`+this.get_path_extra().source+`[\\\\/:%@#&=_~*]|(?!${this.get_path_terminator().source}).){1,${this.opts.maxLength}}|\\/)?`)}get_mail_name(){return this.cache.src_mail_name??=RegExp("[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9](?:[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9]|[.](?=[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9])){0,63}")}get_xn(){return this.cache.src_xn??=RegExp(`xn--[a-z0-9\\-]{1,59}`)}get_tld(){if(this.cache.tld)return this.cache.tld;let e=[...new Set(this.opts.tlds||[])].sort().reverse().join(`|`);return this.cache.tld=RegExp(`${e||`$#none#$`}|${this.get_xn().source}`),this.cache.tld}get_domain_root(){return this.cache.src_domain_root??=RegExp(`(?:`+this.get_xn().source+`|${this.get_pseudo_letter().source}{1,63})`)}get_domain(){return this.cache.src_domain??=RegExp(`(?:`+this.get_xn().source+`|(?:${this.get_pseudo_letter().source})|(?:${this.get_pseudo_letter().source}(?:-|${this.get_pseudo_letter().source}){0,61}${this.get_pseudo_letter().source}))`)}get_url_host_port(){return this.cache.url_host_port??=RegExp(`(?:`+this.get_ipv6_url_host().source+`|(?:(?:(?:${this.get_domain().source})\\.){0,10}${this.get_domain().source}))`+this.get_port().source+this.get_host_terminator().source)}get_fuzzy_url_host_port(){return this.cache.fuzzy_url_host_port??=RegExp(`(?:`+(this.opts.fuzzyIP?this.get_ipv4_addr().source+`|`:``)+`(?:(?:(?:${this.get_domain().source})\\.){1,10}(?:${this.get_tld().source})))`+this.get_host_terminator().source)}get_mail_host(){return this.cache.src_mail_host??=RegExp(`(?:`+this.get_ipv6_mail_host().source+`|(?:(?:(?:${this.get_domain().source})\\.){0,4}${this.get_domain().source}))`+this.get_host_terminator().source)}get_fuzzy_mail_host(){return this.cache.src_fuzzy_mail_host??=RegExp(`(?:`+this.get_ipv6_mail_host().source+`|(?:(?:(?:${this.get_domain().source})[.]){1,4}${this.get_domain_root().source}))`+this.get_host_terminator().source)}get_path_extra(){return this.cache.src_path_extra??=RegExp(``)}get_fuzzy_mail_host_search(){return this.cache.mail_fuzzy_host_search??=RegExp(`@${this.get_fuzzy_mail_host().source}`,`ig`)}get_fuzzy_link_search(){return this.cache.link_fuzzy_search??=RegExp(`(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uff5c]|${this.src_ZPCc}))(?:(?![$+<=>^\`|\uff5c])${this.get_fuzzy_url_host_port().source}${this.get_path().source})`,`ig`)}get_http_validator(){return this.cache.http_validator??=RegExp(`\\/\\/`+(this.opts.urlAuth?this.get_auth().source:``)+this.get_url_host_port().source+this.get_path().source,`iy`)}get_relative_proto_validator(){return this.cache.relative_proto_validator??=RegExp((this.opts.urlAuth?this.get_auth().source:``)+`(?:localhost|${this.get_ipv6_url_host().source}|(?:(?:${this.get_domain().source})[.]){1,10}${this.get_domain_root().source})`+this.get_port().source+this.get_host_terminator().source+this.get_path().source,`iy`)}get_mail_name_validator(){return this.cache.mail_name_validator??=RegExp(`(?:^|${this.get_text_separators().source}|"|\\(|${this.src_ZCc})(${this.get_mail_name().source})$`)}get_mailto_validator(){return this.cache.mailto_validator??=RegExp(`${this.get_mail_name().source}@${this.get_mail_host().source}`,`iy`)}get_schema_names(){return this.cache.schema_names??=new RegExp((this.opts.schema_names||[]).map(e=>this.escapeRE(e)).join(`|`))}get_schema_search(){return this.cache.schema_search??=RegExp(`(^|(?!_)(?:[><\uff5c]|${this.src_ZPCc}))(${this.get_schema_names().source})`,`ig`)}get_schema_at_start(){return this.cache.schema_at_start??=RegExp(`^${this.get_schema_search().source}`,`i`)}},Mi={validate:(e,t,n)=>{let r=n.re.get_http_validator();r.lastIndex=t;let i=r.exec(e);return i?i[0].length:0},normalize:(e,t)=>t.normalize(e)},Ni={"http:":Mi,"https:":Mi,"ftp:":Mi,"//":{validate:function(e,t,n){let r=n.re.get_relative_proto_validator();r.lastIndex=t;let i=r.exec(e);return i?t>=3&&e[t-3]===`:`||t>=3&&e[t-3]===`/`?0:i[0].length:0},normalize:(e,t)=>t.normalize(e)},"mailto:":{validate:function(e,t,n){let r=n.re.get_mailto_validator();r.lastIndex=t;let i=r.exec(e);return i?i[0].length:0},normalize:(e,t)=>t.normalize(e)}},Pi=`a:cdefgilmnoqrstuwxz|b:abdefghijmnorstvwyz|c:acdfghiklmnoruvwxyz|d:ejkmoz|e:cegrstu|f:ijkmor|g:abdefghilmnpqrstuwy|h:kmnrtu|i:delmnoqrst|j:emop|k:eghimnprwyz|l:abcikrstuvy|m:acdeghklmnopqrstuvwxyz|n:acefgilopruz|o:m|p:aefghklmnrstwy|q:a|r:eosuw|s:abcdeghijklmnortuvxyz|t:cdfghjklmnortvwz|u:agksyz|v:aceginu|w:fs|y:et|z:amw`,Fi=`biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф`;function Ii(){let e=Fi.split(`|`);return Pi.split(`|`).forEach(t=>{let n=t.indexOf(`:`),r=t.slice(0,n);for(let i of t.slice(n+1))e.push(r+i)}),e}var Li={fuzzyLink:!1,fuzzyEmail:!0,fuzzyIP:!1,"---":!1,tlds:Ii(),urlAuth:!1,maxLength:1e4},Ri=class{schema;index;lastIndex;raw;text;url;constructor(e,t,n,r){let i=e.slice(n,r);this.schema=t.toLowerCase(),this.index=n,this.lastIndex=r,this.raw=i,this.text=i,this.url=i}},zi=class{__opts__;__schemas__;re;constructor(e={}){let{rebuilder:t,...n}=e;this.__opts__={...Li,...n},this.__schemas__={...Ni},this.re=t||new ji,this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)})}add(e,t=null){if(!t)delete this.__schemas__[e];else{let n={normalize:(e,t)=>t.normalize(e),...t};this.__schemas__[e]=n}return this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}set(e={}){return this.__opts__={...this.__opts__,...e},this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}test(e){if(!e.length)return!1;let t,n;for(n=this.re.get_schema_search(),n.lastIndex=0;(t=n.exec(e))!==null;)if(this.testSchemaAt(e,t[2],n.lastIndex))return!0;if(this.__opts__.fuzzyLink&&this.__schemas__[`http:`]&&(n=this.re.get_fuzzy_link_search(),n.lastIndex=0,n.exec(e)!==null))return!0;if(this.__opts__.fuzzyEmail&&this.__schemas__[`mailto:`]&&e.indexOf(`@`)>=0){let n=this.re.get_fuzzy_mail_host_search(),r=this.re.get_mail_name_validator();for(n.lastIndex=0;(t=n.exec(e))!==null;){let n=e.slice(Math.max(0,t.index-65),t.index);if(r.test(n))return!0}}return!1}testSchemaAt(e,t,n){return this.__schemas__[t.toLowerCase()]?this.__schemas__[t.toLowerCase()].validate(e.slice(0,n+this.__opts__.maxLength),n,this):0}match(e){let t=[],n=this.re.get_schema_search(),r,i,a,o,s,c,l=!1,u=!1,d=!1,f=0;if(!e.length)return null;for(n.lastIndex=0,this.__opts__.fuzzyLink&&this.__schemas__[`http:`]&&(r=this.re.get_fuzzy_link_search(),r.lastIndex=0),this.__opts__.fuzzyEmail&&this.__schemas__[`mailto:`]&&(i=this.re.get_fuzzy_mail_host_search(),i.lastIndex=0,a=this.re.get_mail_name_validator());;){let p=Math.max(f-1,0);if(i&&a&&!d&&(!s||s.index<f))for(i.lastIndex<p&&(i.lastIndex=p);;){let t=i.exec(e);if(!t){d=!0,s=void 0;break}let n=a.exec(e.slice(Math.max(0,t.index-65),t.index));if(n){if(s={schema:`mailto:`,index:t.index-n[1].length,lastIndex:t.index+t[0].length},s.index>=f)break;i.lastIndex<p&&(i.lastIndex=p)}}if(r&&!u&&(!o||o.index<f))for(r.lastIndex<p&&(r.lastIndex=p);;){let t=r.exec(e);if(!t){u=!0,o=void 0;break}if(o={schema:``,index:t.index+t[1].length,lastIndex:t.index+t[0].length},o.index>=f)break;r.lastIndex<p&&(r.lastIndex=p)}let m=s;(!m||o&&(o.index<m.index||o.index===m.index&&o.lastIndex>m.lastIndex))&&(m=o);let h;if(!l)for(;;){if(!c){n.lastIndex<p&&(n.lastIndex=p);let t=n.exec(e);if(!t){l=!0;break}c={schema:t[2],index:t.index+t[1].length,lastIndex:t.index+t[0].length}}if(c.index<f){c=void 0;continue}if(m&&c.index>m.index)break;let t=c;c=void 0;let r=this.testSchemaAt(e,t.schema,t.lastIndex);if(r){h={schema:t.schema,index:t.index,lastIndex:t.lastIndex+r};break}}let g=h;if((!g||s&&(s.index<g.index||s.index===g.index&&s.lastIndex>g.lastIndex))&&(g=s),(!g||o&&(o.index<g.index||o.index===g.index&&o.lastIndex>g.lastIndex))&&(g=o),!g)break;g===s?s=void 0:g===o&&(o=void 0);let _=new Ri(e,g.schema,g.index,g.lastIndex);_.schema?this.__schemas__[_.schema].normalize(_,this):this.normalize(_),t.push(_),f=g.lastIndex}return t.length?t:null}matchAtStart(e){if(!e.length)return null;let t=this.re.get_schema_at_start().exec(e);if(!t)return null;let n=this.testSchemaAt(e,t[2],t[0].length);if(!n)return null;let r=new Ri(e,t[2],t.index+t[1].length,t.index+t[0].length+n);return this.__schemas__[r.schema].normalize(r,this),r}tlds(e,t=!1){return e=Array.isArray(e)?e:[e],t?this.__opts__.tlds=this.__opts__.tlds.concat(e):this.__opts__.tlds=e,this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}normalize(e){e.schema||(e.url=`http://${e.url}`),e.schema===`mailto:`&&!/^mailto:/i.test(e.url)&&(e.url=`mailto:${e.url}`)}},R=2147483647,z=36,Bi=1,Vi=26,Hi=38,Ui=700,Wi=72,Gi=128,Ki=`-`,qi=/^xn--/,Ji=/[^\0-\x7F]/,Yi=/[\x2E\u3002\uFF0E\uFF61]/g,Xi={overflow:`Overflow: input needs wider integers to process`,"not-basic":`Illegal input >= 0x80 (not a basic code point)`,"invalid-input":`Invalid input`},Zi=z-Bi,B=Math.floor,Qi=String.fromCharCode;function V(e){throw RangeError(Xi[e])}function $i(e,t){let n=[],r=e.length;for(;r--;)n[r]=t(e[r]);return n}function ea(e,t){let n=e.split(`@`),r=``;n.length>1&&(r=n[0]+`@`,e=n[1]),e=e.replace(Yi,`.`);let i=$i(e.split(`.`),t).join(`.`);return r+i}function ta(e){let t=[],n=0,r=e.length;for(;n<r;){let i=e.charCodeAt(n++);if(i>=55296&&i<=56319&&n<r){let r=e.charCodeAt(n++);(r&64512)==56320?t.push(((i&1023)<<10)+(r&1023)+65536):(t.push(i),n--)}else t.push(i)}return t}var na=e=>String.fromCodePoint(...e),ra=function(e){return e>=48&&e<58?26+(e-48):e>=65&&e<91?e-65:e>=97&&e<123?e-97:z},ia=function(e,t){return e+22+75*(e<26)-((t!=0)<<5)},aa=function(e,t,n){let r=0;for(e=n?B(e/Ui):e>>1,e+=B(e/t);e>455;r+=z)e=B(e/Zi);return B(r+36*e/(e+Hi))},oa=function(e){let t=[],n=e.length,r=0,i=Gi,a=Wi,o=e.lastIndexOf(Ki);o<0&&(o=0);for(let n=0;n<o;++n)e.charCodeAt(n)>=128&&V(`not-basic`),t.push(e.charCodeAt(n));for(let s=o>0?o+1:0;s<n;){let o=r;for(let t=1,i=z;;i+=z){s>=n&&V(`invalid-input`);let o=ra(e.charCodeAt(s++));o>=z&&V(`invalid-input`),o>B((R-r)/t)&&V(`overflow`),r+=o*t;let c=i<=a?Bi:i>=a+Vi?Vi:i-a;if(o<c)break;let l=z-c;t>B(R/l)&&V(`overflow`),t*=l}let c=t.length+1;a=aa(r-o,c,o==0),B(r/c)>R-i&&V(`overflow`),i+=B(r/c),r%=c,t.splice(r++,0,i)}return String.fromCodePoint(...t)},sa=function(e){let t=[];e=ta(e);let n=e.length,r=Gi,i=0,a=Wi;for(let n of e)n<128&&t.push(Qi(n));let o=t.length,s=o;for(o&&t.push(Ki);s<n;){let n=R;for(let t of e)t>=r&&t<n&&(n=t);let c=s+1;n-r>B((R-i)/c)&&V(`overflow`),i+=(n-r)*c,r=n;for(let n of e)if(n<r&&++i>R&&V(`overflow`),n===r){let e=i;for(let n=z;;n+=z){let r=n<=a?Bi:n>=a+Vi?Vi:n-a;if(e<r)break;let i=e-r,o=z-r;t.push(Qi(ia(r+i%o,0))),e=B(i/o)}t.push(Qi(ia(e,0))),a=aa(i,c,s===o),i=0,++s}++i,++r}return t.join(``)},ca={version:`2.3.1`,ucs2:{decode:ta,encode:na},decode:oa,encode:sa,toASCII:function(e){return ea(e,function(e){return Ji.test(e)?`xn--`+sa(e):e})},toUnicode:function(e){return ea(e,function(e){return qi.test(e)?oa(e.slice(4).toLowerCase()):e})}},la=Object.defineProperty,ua=(e,t)=>{let n={};for(var r in e)la(n,r,{get:e[r],enumerable:!0});return t||la(n,Symbol.toStringTag,{value:`Module`}),n},da=ua({arrayReplaceAt:()=>pa,asciiTrim:()=>Na,callable:()=>fa,escapeHtml:()=>U,escapeRE:()=>Ea,fromCodePoint:()=>ha,isMdAsciiPunct:()=>Aa,isPunctChar:()=>Oa,isPunctCharCode:()=>ka,isSpace:()=>W,isValidEntityCode:()=>ma,isWhiteSpace:()=>Da,lib:()=>Pa,normalizeReference:()=>ja,unescapeAll:()=>H,unescapeMd:()=>ba});function fa(e){let t=function(...n){return Reflect.construct(e,n,new.target&&new.target!==t?new.target:e)};return Object.defineProperty(t,"name",{value:e.name}),Object.setPrototypeOf(t,e),t.prototype=e.prototype,t}function pa(e,t,n){return[].concat(e.slice(0,t),n,e.slice(t+1))}function ma(e){return!(e>=55296&&e<=57343||e>=64976&&e<=65007||(e&65535)==65535||(e&65535)==65534||e>=0&&e<=8||e===11||e>=14&&e<=31||e>=127&&e<=159||e>1114111)}function ha(e){if(e>65535){e-=65536;let t=55296+(e>>10),n=56320+(e&1023);return String.fromCharCode(t,n)}return String.fromCharCode(e)}var ga=/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,_a=RegExp(`${ga.source}|&([a-z#][a-z0-9]{1,31});`,`gi`),va=/^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;function ya(e,t){if(t.charCodeAt(0)===35&&va.test(t)){let n=t[1].toLowerCase()===`x`?parseInt(t.slice(2),16):parseInt(t.slice(1),10);return ma(n)?ha(n):e}let n=Ai(e);return n===e?e:n}function ba(e){return e.indexOf(`\\`)<0?e:e.replace(ga,`$1`)}function H(e){return e.indexOf(`\\`)<0&&e.indexOf(`&`)<0?e:e.replace(_a,function(e,t,n){return t||ya(e,n)})}var xa=/[&<>"]/,Sa=/[&<>"]/g,Ca={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`};function wa(e){return Ca[e]}function U(e){return xa.test(e)?e.replace(Sa,wa):e}var Ta=/[.?*+^$[\]\\(){}|-]/g;function Ea(e){return e.replace(Ta,`\\$&`)}function W(e){switch(e){case 9:case 32:return!0}return!1}function Da(e){if(e>=8192&&e<=8202)return!0;switch(e){case 9:case 10:case 11:case 12:case 13:case 32:case 160:case 5760:case 8239:case 8287:case 12288:return!0}return!1}function Oa(e){return ai.test(e)||oi.test(e)}function ka(e){return Oa(ha(e))}function Aa(e){switch(e){case 33:case 34:case 35:case 36:case 37:case 38:case 39:case 40:case 41:case 42:case 43:case 44:case 45:case 46:case 47:case 58:case 59:case 60:case 61:case 62:case 63:case 64:case 91:case 92:case 93:case 94:case 95:case 96:case 123:case 124:case 125:case 126:return!0;default:return!1}}function ja(e){return e=e.trim().replace(/\s+/g,` `),e.toLowerCase().toUpperCase()}function Ma(e){return e===32||e===9||e===10||e===13}function Na(e){let t=0;for(;t<e.length&&Ma(e.charCodeAt(t));t++);let n=e.length-1;for(;n>=t&&Ma(e.charCodeAt(n));n--);return e.slice(t,n+1)}var Pa={mdurl:ei,ucmicro:ti};function Fa(e,t,n){let r,i,a,o,s=e.posMax,c=e.pos;for(e.pos=t+1,r=1;e.pos<s;){if(a=e.src.charCodeAt(e.pos),a===93&&(r--,r===0)){i=!0;break}if(o=e.pos,e.md.inline.skipToken(e),a===91){if(o===e.pos-1)r++;else if(n)return e.pos=c,-1}}let l=-1;return i&&(l=e.pos),e.pos=c,l}function Ia(e,t,n){let r,i=t,a={ok:!1,pos:0,str:``};if(e.charCodeAt(i)===60){for(i++;i<n;){if(r=e.charCodeAt(i),r===10||r===60)return a;if(r===62)return a.pos=i+1,a.str=H(e.slice(t+1,i)),a.ok=!0,a;if(r===92&&i+1<n){i+=2;continue}i++}return a}let o=0;for(;i<n&&(r=e.charCodeAt(i),!(r===32||r<32||r===127));){if(r===92&&i+1<n){if(e.charCodeAt(i+1)===32){i++;continue}i+=2;continue}if(r===40&&(o++,o>32))return a;if(r===41){if(o===0)break;o--}i++}return t===i||o!==0?a:(a.str=H(e.slice(t,i)),a.pos=i,a.ok=!0,a)}function La(e,t,n,r){let i,a=t,o={ok:!1,can_continue:!1,pos:0,str:``,marker:0};if(r)o.str=r.str,o.marker=r.marker;else{if(a>=n)return o;let r=e.charCodeAt(a);if(r!==34&&r!==39&&r!==40)return o;t++,a++,r===40&&(r=41),o.marker=r}for(;a<n;){if(i=e.charCodeAt(a),i===o.marker)return o.pos=a+1,o.str+=H(e.slice(t,a)),o.ok=!0,o;if(i===40&&o.marker===41)return o;i===92&&a+1<n&&a++,a++}return o.can_continue=!0,o.str+=H(e.slice(t,a)),o}var Ra=ua({parseLinkDestination:()=>Ia,parseLinkLabel:()=>Fa,parseLinkTitle:()=>La});function za(e){"@babel/helpers - typeof";return za=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},za(e)}function Ba(e,t){if(za(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(za(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function Va(e){var t=Ba(e,`string`);return za(t)==`symbol`?t:t+``}function G(e,t,n){return(t=Va(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var K=class{constructor(e,t,n){G(this,`map`,null),G(this,`level`,0),G(this,`children`,null),G(this,`content`,``),G(this,`markup`,``),G(this,`info`,``),G(this,`block`,!1),G(this,`hidden`,!1),this.type=e,this.tag=t,this.attrs=null,this.nesting=n,this.meta=null}attrIndex(e){if(!this.attrs)return-1;let t=this.attrs;for(let n=0,r=t.length;n<r;n++)if(t[n][0]===e)return n;return-1}attrPush(e){this.attrs?this.attrs.push(e):this.attrs=[e]}attrSet(e,t){let n=this.attrIndex(e),r=[e,t];n<0?this.attrPush(r):this.attrs[n]=r}attrGet(e){let t=this.attrIndex(e),n=null;return t>=0&&(n=this.attrs[t][1]),n}attrJoin(e,t){let n=this.attrIndex(e);n<0?this.attrPush([e,t]):this.attrs[n][1]=`${this.attrs[n][1]} ${t}`}},Ha=class{constructor(){G(this,`__rules__`,[]),G(this,`__cache__`,null)}__find__(e){for(let t=0;t<this.__rules__.length;t++)if(this.__rules__[t].name===e)return t;return-1}__compile__(){let e=new Set;this.__rules__.forEach(t=>{t.enabled&&t.alt.forEach(t=>{t&&e.add(t)})}),this.__cache__=Object.create(null),this.__cache__[``]=[],this.__rules__.forEach(e=>{e.enabled&&this.__cache__[``].push(e.fn)}),e.forEach(e=>{this.__cache__[e]=[],this.__rules__.forEach(t=>{t.enabled&&t.alt.indexOf(e)>=0&&this.__cache__[e].push(t.fn)})})}at(e,t,n={}){let r=this.__find__(e);if(r===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__[r].fn=t,this.__rules__[r].alt=n.alt||[],this.__cache__=null}before(e,t,n,r={}){let i=this.__find__(e);if(i===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__.splice(i,0,{name:t,enabled:!0,fn:n,alt:r.alt||[]}),this.__cache__=null}after(e,t,n,r={}){let i=this.__find__(e);if(i===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__.splice(i+1,0,{name:t,enabled:!0,fn:n,alt:r.alt||[]}),this.__cache__=null}push(e,t,n={}){this.__rules__.push({name:e,enabled:!0,fn:t,alt:n.alt||[]}),this.__cache__=null}enable(e,t=!1){Array.isArray(e)||(e=[e]);let n=[];return e.forEach(e=>{let r=this.__find__(e);if(r<0){if(t)return;throw Error(`Rules manager: invalid rule name ${e}`)}this.__rules__[r].enabled=!0,n.push(e)}),this.__cache__=null,n}enableOnly(e,t=!1){Array.isArray(e)||(e=[e]),this.__rules__.forEach(e=>{e.enabled=!1}),this.enable(e,t)}disable(e,t=!1){Array.isArray(e)||(e=[e]);let n=[];return e.forEach(e=>{let r=this.__find__(e);if(r<0){if(t)return;throw Error(`Rules manager: invalid rule name ${e}`)}this.__rules__[r].enabled=!1,n.push(e)}),this.__cache__=null,n}getRules(e){return this.__cache__||this.__compile__(),this.__cache__[e]||[]}},q={};q.code_inline=function(e,t,n,r,i){let a=e[t];return`<code${i.renderAttrs(a)}>${U(a.content)}</code>`},q.code_block=function(e,t,n,r,i){let a=e[t];return`<pre${i.renderAttrs(a)}><code>${U(e[t].content)}</code></pre>\n`},q.fence=function(e,t,n,r,i){let a=e[t],o=a.info?H(a.info).trim():``,s=``,c=``;if(o){let e=o.split(/(\s+)/g);s=e[0],c=e.slice(2).join(``)}let l;if(l=n.highlight&&n.highlight(a.content,s,c)||U(a.content),l.indexOf(`<pre`)===0)return l+`
`;if(o){let e=a.attrIndex(`class`),t=a.attrs?a.attrs.slice():[];e<0?t.push([`class`,`${n.langPrefix}${s}`]):(t[e]=[t[e][0],t[e][1]],t[e][1]+=` ${n.langPrefix}${s}`);let r={attrs:t};return`<pre><code${i.renderAttrs(r)}>${l}</code></pre>\n`}return`<pre><code${i.renderAttrs(a)}>${l}</code></pre>\n`},q.image=function(e,t,n,r,i){let a=e[t];return a.attrs[a.attrIndex(`alt`)][1]=i.renderInlineAsText(a.children,n,r),i.renderToken(e,t,n)},q.hardbreak=function(e,t,n){return n.xhtmlOut?`<br />
`:`<br>
`},q.softbreak=function(e,t,n){return n.breaks?n.xhtmlOut?`<br />
`:`<br>
`:`
`},q.text=function(e,t){return U(e[t].content)},q.html_block=function(e,t){return e[t].content},q.html_inline=function(e,t){return e[t].content};var Ua=class{constructor(){G(this,`rules`,Object.assign({},q))}renderAttrs(e){let t,n,r;if(!e.attrs)return``;for(r=``,t=0,n=e.attrs.length;t<n;t++)r+=` ${U(e.attrs[t][0])}="${U(String(e.attrs[t][1]))}"`;return r}renderToken(e,t,n){let r=e[t],i=``;if(r.hidden)return``;let a=t-1;for(;a>=0&&e[a].hidden&&e[a].nesting===0;)a--;r.block&&r.nesting!==-1&&a>=0&&e[a].hidden&&e[a].nesting===-1&&(i+=`
`),i+=(r.nesting===-1?`</`:`<`)+r.tag,i+=this.renderAttrs(r),r.nesting===0&&n.xhtmlOut&&(i+=` /`);let o=!1;if(r.block&&(o=!0,r.nesting===1)){let n=t+1;for(;n<e.length&&e[n].hidden&&e[n].nesting===0;)n++;if(n<e.length){let t=e[n];(t.type===`inline`||t.hidden||t.nesting===-1&&t.tag===r.tag)&&(o=!1)}}return i+=o?`>
`:`>`,i}renderInline(e,t,n){let r=``,i=this.rules;for(let a=0,o=e.length;a<o;a++){let o=e[a].type;i[o]===void 0?r+=this.renderToken(e,a,t):r+=i[o](e,a,t,n,this)}return r}renderInlineAsText(e,t,n){let r=``;for(let i=0,a=e.length;i<a;i++)switch(e[i].type){case`text`:case`code_inline`:r+=e[i].content;break;case`image`:r+=this.renderInlineAsText(e[i].children,t,n);break;case`html_inline`:case`html_block`:r+=e[i].content;break;case`softbreak`:case`hardbreak`:r+=`
`}return r}render(e,t,n){let r=``,i=this.rules;for(let a=0,o=e.length;a<o;a++){let o=e[a].type;o===`inline`?r+=this.renderInline(e[a].children,t,n):i[o]===void 0?r+=this.renderToken(e,a,t):r+=i[o](e,a,t,n,this)}return r}},Wa=class{constructor(e,t,n){G(this,`tokens`,[]),G(this,`inlineMode`,!1),G(this,`Token`,K),this.src=e,this.env=n,this.md=t}},Ga=/\r\n?/g,Ka=/\0/g;function qa(e){let t;t=e.src.replace(Ga,`
`),t=t.replace(Ka,`�`),e.src=t}function Ja(e){let t;e.inlineMode?(t=new e.Token(`inline`,``,0),t.content=e.src,t.map=[0,1],t.children=[],e.tokens.push(t)):e.md.block.parse(e.src,e.md,e.env,e.tokens)}function Ya(e){let t=e.tokens,n=0;for(let e=0;e<t.length;e++)t[e].type!==`reference_definition`&&(e!==n&&(t[n]=t[e]),n++);t.length!==n&&(t.length=n)}function Xa(e){let t=e.tokens;for(let n=0,r=t.length;n<r;n++){let r=t[n];r.type===`inline`&&e.md.inline.parse(r.content,e.md,e.env,r.children)}}function Za(e){return/^<a[>\s]/i.test(e)}function Qa(e){return/^<\/a\s*>/i.test(e)}function $a(e){let t=e.tokens;if(e.md.options.linkify)for(let n=0,r=t.length;n<r;n++){if(t[n].type!==`inline`||!e.md.linkify.test(t[n].content))continue;let r=t[n].children,i=[],a=0;for(let t=r.length-1;t>=0;t--){let n=r[t];if(n.type===`link_close`){for(t--;r[t].level!==n.level&&r[t].type!==`link_open`;)t--;continue}if(n.type===`html_inline`&&(Za(n.content)&&a>0&&a--,Qa(n.content)&&a++),!(a>0)&&n.type===`text`&&e.md.linkify.test(n.content)){let a=n.content,o=e.md.linkify.match(a),s=[],c=n.level,l=0;o.length>0&&o[0].index===0&&t>0&&r[t-1].type===`text_special`&&(o=o.slice(1));for(let t=0;t<o.length;t++){let n=o[t].url,r=e.md.normalizeLink(n);if(!e.md.validateLink(r))continue;let i=o[t].text;i=o[t].schema?o[t].schema===`mailto:`&&!/^mailto:/i.test(i)?e.md.normalizeLinkText(`mailto:${i}`).replace(/^mailto:/,``):e.md.normalizeLinkText(i):e.md.normalizeLinkText(`http://${i}`).replace(/^http:\/\//,``);let u=o[t].index;if(u>l){let t=new e.Token(`text`,``,0);t.content=a.slice(l,u),t.level=c,s.push(t)}let d=new e.Token(`link_open`,`a`,1);d.attrs=[[`href`,r]],d.level=c++,d.markup=`linkify`,d.info=`auto`,s.push(d);let f=new e.Token(`text`,``,0);f.content=i,f.level=c,s.push(f);let p=new e.Token(`link_close`,`a`,-1);p.level=--c,p.markup=`linkify`,p.info=`auto`,s.push(p),l=o[t].lastIndex}if(l<a.length){let t=new e.Token(`text`,``,0);t.content=a.slice(l),t.level=c,s.push(t)}i.push({index:t,nodes:s})}}if(i.length>0){let e=r.length;for(let t of i)e+=t.nodes.length-1;let a=Array(e),o=0,s=0;i.reverse();for(let e=0;e<r.length;e++){let t=i[o];if(t?.index===e){for(let e of t.nodes)a[s++]=e;o++}else a[s++]=r[e]}t[n].children=a}}}var eo=/\+-|\.\.|\?\?\?\?|!!!!|,,|--/,to=/\((c|tm|r)\)/i,no=/\((c|tm|r)\)/gi,ro={c:`©`,r:`®`,tm:`™`};function io(e,t){return ro[t.toLowerCase()]}function ao(e){let t=0;for(let n=e.length-1;n>=0;n--){let r=e[n];r.type===`text`&&!t&&(r.content=r.content.replace(no,io)),r.type===`link_open`&&r.info===`auto`&&t--,r.type===`link_close`&&r.info===`auto`&&t++}}function oo(e){let t=0;for(let n=e.length-1;n>=0;n--){let r=e[n];r.type===`text`&&!t&&eo.test(r.content)&&(r.content=r.content.replace(/\+-/g,`±`).replace(/\.{2,}/g,`…`).replace(/([?!])…/g,`$1..`).replace(/([?!]){4,}/g,`$1$1$1`).replace(/,{2,}/g,`,`).replace(/(^|[^-])---(?=[^-]|$)/gm,`$1—`).replace(/(^|\s)--(?=\s|$)/gm,`$1–`).replace(/(^|[^-\s])--(?=[^-\s]|$)/gm,`$1–`)),r.type===`link_open`&&r.info===`auto`&&t--,r.type===`link_close`&&r.info===`auto`&&t++}}function so(e){let t;if(e.md.options.typographer)for(t=e.tokens.length-1;t>=0;t--)e.tokens[t].type===`inline`&&(to.test(e.tokens[t].content)&&ao(e.tokens[t].children),eo.test(e.tokens[t].content)&&oo(e.tokens[t].children))}var co=/['"]/,lo=/['"]/g,uo=`’`,fo=1e3;function po(e,t,n){for(;e.length>n;){let n=e.pop();n.isSingleQuote?t.single=n.prevSameQuoteIdx:t.double=n.prevSameQuoteIdx}}function mo(e,t,n,r){e[t]||(e[t]=[]),e[t].push({pos:n,ch:r})}function ho(e,t){let n=``,r=0;t.sort((e,t)=>e.pos-t.pos);for(let i=0;i<t.length;i++){let a=t[i];n+=e.slice(r,a.pos)+a.ch,r=a.pos+1}return n+e.slice(r)}function go(e,t){let n,r=[],i={single:-1,double:-1},a={};for(let o=0;o<e.length;o++){let s=e[o],c=e[o].level;for(n=r.length-1;n>=0&&!(r[n].level<=c);n--);if(po(r,i,n+1),s.type!==`text`)continue;let l=s.content,u=0,d=l.length;OUTER:for(;u<d;){lo.lastIndex=u;let s=lo.exec(l);if(!s)break;let f=!0,p=!0;u=s.index+1;let m=s[0]===`'`,h=32;if(s.index-1>=0)h=l.charCodeAt(s.index-1);else for(n=o-1;n>=0&&!(e[n].type===`softbreak`||e[n].type===`hardbreak`);n--)if(e[n].content){h=e[n].content.charCodeAt(e[n].content.length-1);break}let g=32;if(u<d)g=l.charCodeAt(u);else for(n=o+1;n<e.length&&!(e[n].type===`softbreak`||e[n].type===`hardbreak`);n++)if(e[n].content){g=e[n].content.charCodeAt(0);break}let _=Aa(h)||ka(h),v=Aa(g)||ka(g),y=Da(h),b=Da(g);if(b?f=!1:v&&(y||_||(f=!1)),y?p=!1:_&&(b||v||(p=!1)),g===34&&s[0]===`"`&&h>=48&&h<=57&&(p=f=!1),f&&p&&(f=_,p=v),!f&&!p){m&&mo(a,o,s.index,uo);continue}if(p&&(n=m?i.single:i.double,n>=0&&r[n].level===c)){let e=r[n],c,l;m?(c=t.md.options.quotes[2],l=t.md.options.quotes[3]):(c=t.md.options.quotes[0],l=t.md.options.quotes[1]),mo(a,o,s.index,l),mo(a,e.tokenIdx,e.contentPos,c),po(r,i,n);continue OUTER}if(f){if(r.length>=fo)return;r.push({tokenIdx:o,contentPos:s.index,isSingleQuote:m,level:c,prevSameQuoteIdx:m?i.single:i.double}),m?i.single=r.length-1:i.double=r.length-1}else p&&m&&mo(a,o,s.index,uo)}}Object.keys(a).forEach(function(t){let n=Number(t);e[n].content=ho(e[n].content,a[t])})}function _o(e){if(e.md.options.typographer)for(let t=e.tokens.length-1;t>=0;t--)e.tokens[t].type!==`inline`||!co.test(e.tokens[t].content)||go(e.tokens[t].children,e)}function vo(e){let t,n,r=e.length;for(t=0;t<r;t++)e[t].type===`text_special`&&(e[t].type=`text`);for(t=n=0;t<r;t++)e[t].type===`text`&&t+1<r&&e[t+1].type===`text`?e[t+1].content=e[t].content+e[t+1].content:(t!==n&&(e[n]=e[t]),n++);t!==n&&(e.length=n)}function yo(e){let t,n,r=e.tokens,i=r.length;for(let e=0;e<i;e++){if(r[e].type!==`inline`)continue;let i=r[e].children,a=i.length;for(t=0;t<a;t++)i[t].type===`text_special`&&(i[t].type=`text`),i[t].children&&vo(i[t].children);for(t=n=0;t<a;t++)i[t].type===`text`&&t+1<a&&i[t+1].type===`text`?i[t+1].content=i[t].content+i[t+1].content:(t!==n&&(i[n]=i[t]),n++);t!==n&&(i.length=n)}}var bo=[[`normalize`,qa],[`block`,Ja],[`strip_references`,Ya],[`inline`,Xa],[`linkify`,$a],[`replacements`,so],[`smartquotes`,_o],[`text_join`,yo]],xo=class{constructor(){G(this,`ruler`,new Ha),G(this,`State`,Wa);for(let e=0;e<bo.length;e++)this.ruler.push(bo[e][0],bo[e][1])}process(e){let t=this.ruler.getRules(``);for(let n=0,r=t.length;n<r;n++)t[n](e)}},So=class{constructor(e,t,n,r){G(this,`bMarks`,[]),G(this,`eMarks`,[]),G(this,`tShift`,[]),G(this,`sCount`,[]),G(this,`bsCount`,[]),G(this,`blkIndent`,0),G(this,`line`,0),G(this,`lineMax`,0),G(this,`tight`,!1),G(this,`listIndent`,-1),G(this,`parentType`,`root`),G(this,`level`,0),G(this,`Token`,K),this.src=e,this.md=t,this.env=n,this.tokens=r;let i=this.src;for(let e=0,t=0,n=0,r=0,a=i.length,o=!1;t<a;t++){let s=i.charCodeAt(t);if(!o)if(W(s)){n++,s===9?r+=4-r%4:r++;continue}else o=!0;(s===10||t===a-1)&&(s!==10&&t++,this.bMarks.push(e),this.eMarks.push(t),this.tShift.push(n),this.sCount.push(r),this.bsCount.push(0),o=!1,n=0,r=0,e=t+1)}this.bMarks.push(i.length),this.eMarks.push(i.length),this.tShift.push(0),this.sCount.push(0),this.bsCount.push(0),this.lineMax=this.bMarks.length-1}push(e,t,n){let r=new K(e,t,n);return r.block=!0,n<0&&this.level--,r.level=this.level,n>0&&this.level++,this.tokens.push(r),r}isEmpty(e){return this.bMarks[e]+this.tShift[e]>=this.eMarks[e]}skipEmptyLines(e){for(let t=this.lineMax;e<t&&!(this.bMarks[e]+this.tShift[e]<this.eMarks[e]);e++);return e}skipSpaces(e){for(let t=this.src.length;e<t&&W(this.src.charCodeAt(e));e++);return e}skipSpacesBack(e,t){if(e<=t)return e;for(;e>t;)if(!W(this.src.charCodeAt(--e)))return e+1;return e}skipChars(e,t){for(let n=this.src.length;e<n&&this.src.charCodeAt(e)===t;e++);return e}skipCharsBack(e,t,n){if(e<=n)return e;for(;e>n;)if(t!==this.src.charCodeAt(--e))return e+1;return e}getLines(e,t,n,r){if(e>=t)return``;let i=Array(t-e);for(let a=0,o=e;o<t;o++,a++){let e=0,s=this.bMarks[o],c=s,l;for(l=o+1<t||r?this.eMarks[o]+1:this.eMarks[o];c<l&&e<n;){let t=this.src.charCodeAt(c);if(W(t))t===9?e+=4-(e+this.bsCount[o])%4:e++;else if(c-s<this.tShift[o])e++;else break;c++}e>n?i[a]=Array(e-n+1).join(` `)+this.src.slice(c,l):i[a]=this.src.slice(c,l)}return i.join(``)}},Co=65536;function wo(e,t){let n=e.bMarks[t]+e.tShift[t],r=e.eMarks[t];return e.src.slice(n,r)}function To(e){let t=[],n=e.length,r=0,i=e.charCodeAt(r),a=!1,o=0,s=``;for(;r<n;)i===124&&(a?(s+=e.substring(o,r-1),o=r):(t.push(s+e.substring(o,r)),s=``,o=r+1)),a=i===92,r++,i=e.charCodeAt(r);return t.push(s+e.substring(o)),t}function Eo(e,t,n,r){if(t+2>n)return!1;let i=t+1;if(e.sCount[i]<e.blkIndent||e.sCount[i]-e.blkIndent>=4)return!1;let a=e.bMarks[i]+e.tShift[i];if(a>=e.eMarks[i])return!1;let o=e.src.charCodeAt(a++);if(o!==124&&o!==45&&o!==58||a>=e.eMarks[i])return!1;let s=e.src.charCodeAt(a++);if(s!==124&&s!==45&&s!==58&&!W(s)||o===45&&W(s))return!1;for(;a<e.eMarks[i];){let t=e.src.charCodeAt(a);if(t!==124&&t!==45&&t!==58&&!W(t))return!1;a++}let c=wo(e,t+1),l=c.split(`|`),u=[];for(let e=0;e<l.length;e++){let t=l[e].trim();if(!t){if(e===0||e===l.length-1)continue;return!1}if(!/^:?-+:?$/.test(t))return!1;t.charCodeAt(t.length-1)===58?u.push(t.charCodeAt(0)===58?`center`:`right`):t.charCodeAt(0)===58?u.push(`left`):u.push(``)}if(c=wo(e,t).trim(),c.indexOf(`|`)===-1||e.sCount[t]-e.blkIndent>=4)return!1;l=To(c),l.length&&l[0]===``&&l.shift(),l.length&&l[l.length-1]===``&&l.pop();let d=l.length;if(d===0||d!==u.length)return!1;if(r)return!0;let f=e.parentType;e.parentType=`table`;let p=e.md.block.ruler.getRules(`blockquote`),m=e.push(`table_open`,`table`,1),h=[t,0];m.map=h;let g=e.push(`thead_open`,`thead`,1);g.map=[t,t+1];let _=e.push(`tr_open`,`tr`,1);_.map=[t,t+1];for(let t=0;t<l.length;t++){let n=e.push(`th_open`,`th`,1);u[t]&&(n.attrs=[[`style`,`text-align:${u[t]}`]]);let r=e.push(`inline`,``,0);r.content=l[t].trim(),r.children=[],e.push(`th_close`,`th`,-1)}e.push(`tr_close`,`tr`,-1),e.push(`thead_close`,`thead`,-1);let v,y=0;for(i=t+2;i<n&&!(e.sCount[i]<e.blkIndent);i++){let r=!1;for(let t=0,a=p.length;t<a;t++)if(p[t](e,i,n,!0)){r=!0;break}if(r||(c=wo(e,i).trim(),!c)||e.sCount[i]-e.blkIndent>=4||(l=To(c),l.length&&l[0]===``&&l.shift(),l.length&&l[l.length-1]===``&&l.pop(),y+=d-l.length,y>Co))break;if(i===t+2){let n=e.push(`tbody_open`,`tbody`,1);n.map=v=[t+2,0]}let a=e.push(`tr_open`,`tr`,1);a.map=[i,i+1];for(let t=0;t<d;t++){let n=e.push(`td_open`,`td`,1);u[t]&&(n.attrs=[[`style`,`text-align:${u[t]}`]]);let r=e.push(`inline`,``,0);r.content=l[t]?l[t].trim():``,r.children=[],e.push(`td_close`,`td`,-1)}e.push(`tr_close`,`tr`,-1)}return v&&(e.push(`tbody_close`,`tbody`,-1),v[1]=i),e.push(`table_close`,`table`,-1),h[1]=i,e.parentType=f,e.line=i,!0}function Do(e,t,n){if(e.sCount[t]-e.blkIndent<4)return!1;let r=t+1,i=r;for(;r<n;){if(e.isEmpty(r)){r++;continue}if(e.sCount[r]-e.blkIndent>=4){r++,i=r;continue}break}e.line=i;let a=e.push(`code_block`,`code`,0);return a.content=e.getLines(t,i,4+e.blkIndent,!1)+`
`,a.map=[t,e.line],!0}function Oo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4||i+3>a)return!1;let o=e.src.charCodeAt(i);if(o!==126&&o!==96)return!1;let s=i;i=e.skipChars(i,o);let c=i-s;if(c<3)return!1;let l=e.src.slice(s,i),u=e.src.slice(i,a);if(o===96&&u.indexOf(String.fromCharCode(o))>=0)return!1;if(r)return!0;let d=t,f=!1;for(;d++,!(d>=n||(i=s=e.bMarks[d]+e.tShift[d],a=e.eMarks[d],i<a&&e.sCount[d]<e.blkIndent));)if(e.src.charCodeAt(i)===o&&!(e.sCount[d]-e.blkIndent>=4)&&(i=e.skipChars(i,o),!(i-s<c)&&(i=e.skipSpaces(i),!(i<a)))){f=!0;break}c=e.sCount[t],e.line=d+ +!!f;let p=e.push(`fence`,`code`,0);return p.info=u,p.content=e.getLines(t+1,d,c,!0),p.markup=l,p.map=[t,e.line],!0}function ko(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t],o=e.lineMax;if(e.sCount[t]-e.blkIndent>=4||e.src.charCodeAt(i)!==62)return!1;if(r)return!0;let s=[],c=[],l=[],u=[],d=e.md.block.ruler.getRules(`blockquote`),f=e.parentType;e.parentType=`blockquote`;let p=!1,m;for(m=t;m<n;m++){let t=e.sCount[m]<e.blkIndent;if(i=e.bMarks[m]+e.tShift[m],a=e.eMarks[m],i>=a)break;if(e.src.charCodeAt(i++)===62&&!t){let t=e.sCount[m]+1,n,r;e.src.charCodeAt(i)===32?(i++,t++,r=!1,n=!0):e.src.charCodeAt(i)===9?(n=!0,(e.bsCount[m]+t)%4==3?(i++,t++,r=!1):r=!0):n=!1;let o=t;for(s.push(e.bMarks[m]),e.bMarks[m]=i;i<a;){let t=e.src.charCodeAt(i);if(W(t))t===9?o+=4-(o+e.bsCount[m]+ +!!r)%4:o++;else break;i++}p=i>=a,c.push(e.bsCount[m]),e.bsCount[m]=e.sCount[m]+1+ +!!n,l.push(e.sCount[m]),e.sCount[m]=o-t,u.push(e.tShift[m]),e.tShift[m]=i-e.bMarks[m];continue}if(p)break;let r=!1;for(let t=0,i=d.length;t<i;t++)if(d[t](e,m,n,!0)){r=!0;break}if(r){e.lineMax=m,e.blkIndent!==0&&(s.push(e.bMarks[m]),c.push(e.bsCount[m]),u.push(e.tShift[m]),l.push(e.sCount[m]),e.sCount[m]-=e.blkIndent);break}s.push(e.bMarks[m]),c.push(e.bsCount[m]),u.push(e.tShift[m]),l.push(e.sCount[m]),e.sCount[m]=-1}let h=e.blkIndent;e.blkIndent=0;let g=e.push(`blockquote_open`,`blockquote`,1);g.markup=`>`;let _=[t,0];g.map=_,e.md.block.tokenize(e,t,m);let v=e.push(`blockquote_close`,`blockquote`,-1);v.markup=`>`,e.lineMax=o,e.parentType=f,_[1]=e.line;for(let n=0;n<u.length;n++)e.bMarks[n+t]=s[n],e.tShift[n+t]=u[n],e.sCount[n+t]=l[n],e.bsCount[n+t]=c[n];return e.blkIndent=h,!0}function Ao(e,t,n,r){let i=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4)return!1;let a=e.bMarks[t]+e.tShift[t],o=e.src.charCodeAt(a++);if(o!==42&&o!==45&&o!==95)return!1;let s=1;for(;a<i;){let t=e.src.charCodeAt(a++);if(t!==o&&!W(t))return!1;t===o&&s++}if(s<3)return!1;if(r)return!0;e.line=t+1;let c=e.push(`hr`,`hr`,0);return c.map=[t,e.line],c.markup=Array(s+1).join(String.fromCharCode(o)),!0}function jo(e,t){let n=e.eMarks[t],r=e.bMarks[t]+e.tShift[t],i=e.src.charCodeAt(r++);return i!==42&&i!==45&&i!==43||r<n&&!W(e.src.charCodeAt(r))?-1:r}function Mo(e,t){let n=e.bMarks[t]+e.tShift[t],r=e.eMarks[t],i=n;if(i+1>=r)return-1;let a=e.src.charCodeAt(i++);if(a<48||a>57)return-1;for(;;){if(i>=r)return-1;if(a=e.src.charCodeAt(i++),a>=48&&a<=57){if(i-n>=10)return-1;continue}if(a===41||a===46)break;return-1}return i<r&&(a=e.src.charCodeAt(i),!W(a))?-1:i}function No(e,t){let n=e.level+2;for(let r=t+2,i=e.tokens.length-2;r<i;r++)e.tokens[r].level===n&&e.tokens[r].type===`paragraph_open`&&(e.tokens[r+2].hidden=!0,e.tokens[r].hidden=!0,r+=2)}function Po(e,t,n,r){let i,a,o,s,c=t,l=!0;if(e.sCount[c]-e.blkIndent>=4||e.listIndent>=0&&e.sCount[c]-e.listIndent>=4&&e.sCount[c]<e.blkIndent)return!1;let u=!1;r&&e.parentType===`paragraph`&&e.sCount[c]>=e.blkIndent&&(u=!0);let d,f,p;if((p=Mo(e,c))>=0){if(d=!0,o=e.bMarks[c]+e.tShift[c],f=Number(e.src.slice(o,p-1)),u&&f!==1)return!1}else if((p=jo(e,c))>=0)d=!1;else return!1;if(u&&e.skipSpaces(p)>=e.eMarks[c])return!1;if(r)return!0;let m=e.src.charCodeAt(p-1),h=e.tokens.length;d?(s=e.push(`ordered_list_open`,`ol`,1),f!==1&&(s.attrs=[[`start`,f]])):s=e.push(`bullet_list_open`,`ul`,1);let g=[c,0];s.map=g,s.markup=String.fromCharCode(m);let _=!1,v=e.md.block.ruler.getRules(`list`),y=e.parentType;for(e.parentType=`list`;c<n;){a=p,i=e.eMarks[c];let t=e.sCount[c]+p-(e.bMarks[c]+e.tShift[c]),r=t;for(;a<i;){let t=e.src.charCodeAt(a);if(t===9)r+=4-(r+e.bsCount[c])%4;else if(t===32)r++;else break;a++}let u=a,f;f=u>=i?1:r-t,f>4&&(f=1);let h=t+f;s=e.push(`list_item_open`,`li`,1),s.markup=String.fromCharCode(m);let g=[c,0];s.map=g,d&&(s.info=e.src.slice(o,p-1));let y=e.tight,b=e.tShift[c],x=e.sCount[c],S=e.listIndent;if(e.listIndent=e.blkIndent,e.blkIndent=h,e.tight=!0,e.tShift[c]=u-e.bMarks[c],e.sCount[c]=r,u>=i&&e.isEmpty(c+1)?e.line=Math.min(e.line+2,n):e.md.block.tokenize(e,c,n),(!e.tight||_)&&(l=!1),_=e.line-c>1&&e.isEmpty(e.line-1),e.blkIndent=e.listIndent,e.listIndent=S,e.tShift[c]=b,e.sCount[c]=x,e.tight=y,s=e.push(`list_item_close`,`li`,-1),s.markup=String.fromCharCode(m),c=e.line,g[1]=c,c>=n||e.sCount[c]<e.blkIndent||e.sCount[c]-e.blkIndent>=4)break;let C=!1;for(let t=0,r=v.length;t<r;t++)if(v[t](e,c,n,!0)){C=!0;break}if(C)break;if(d){if(p=Mo(e,c),p<0)break;o=e.bMarks[c]+e.tShift[c]}else if(p=jo(e,c),p<0)break;if(m!==e.src.charCodeAt(p-1))break}return s=d?e.push(`ordered_list_close`,`ol`,-1):e.push(`bullet_list_close`,`ul`,-1),s.markup=String.fromCharCode(m),g[1]=c,e.line=c,e.parentType=y,l&&No(e,h),!0}function Fo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t],o=t+1;if(e.sCount[t]-e.blkIndent>=4||e.src.charCodeAt(i)!==91)return!1;function s(t){let n=e.lineMax;if(t>=n||e.isEmpty(t))return null;let r=!1;if(e.sCount[t]-e.blkIndent>3&&(r=!0),e.sCount[t]<0&&(r=!0),!r){let r=e.md.block.ruler.getRules(`reference`),i=e.parentType;e.parentType=`reference`;let a=!1;for(let i=0,o=r.length;i<o;i++)if(r[i](e,t,n,!0)){a=!0;break}if(e.parentType=i,a)return null}let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];return e.src.slice(i,a+1)}let c=e.src.slice(i,a+1);a=c.length;let l=-1;for(i=1;i<a;i++){let e=c.charCodeAt(i);if(e===91)return!1;if(e===93){l=i;break}else if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(e===92&&(i++,i<a&&c.charCodeAt(i)===10)){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}}if(l<0||c.charCodeAt(l+1)!==58)return!1;for(i=l+2;i<a;i++){let e=c.charCodeAt(i);if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(!W(e))break}let u=e.md.helpers.parseLinkDestination(c,i,a);if(!u.ok)return!1;let d=e.md.normalizeLink(u.str);if(!e.md.validateLink(d))return!1;i=u.pos;let f=i,p=o,m=i;for(;i<a;i++){let e=c.charCodeAt(i);if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(!W(e))break}let h=e.md.helpers.parseLinkTitle(c,i,a);for(;h.can_continue;){let t=s(o);if(t===null)break;c+=t,i=a,a=c.length,o++,h=e.md.helpers.parseLinkTitle(c,i,a,h)}let g;for(i<a&&m!==i&&h.ok?(g=h.str,i=h.pos):(g=``,i=f,o=p);i<a&&W(c.charCodeAt(i));)i++;if(i<a&&c.charCodeAt(i)!==10&&g)for(g=``,i=f,o=p;i<a&&W(c.charCodeAt(i));)i++;if(i<a&&c.charCodeAt(i)!==10)return!1;let _=ja(c.slice(1,l));if(!_)return!1;if(r)return!0;e.env.references===void 0&&(e.env.references={}),e.env.references[_]===void 0&&(e.env.references[_]={title:g,href:d});let v=e.push(`reference_definition`,``,0);v.map=[t,o],v.hidden=!0;let y=Object.create(null);return y.label=_,v.meta=y,e.line=o,!0}var Io=`address.article.aside.base.basefont.blockquote.body.caption.center.col.colgroup.dd.details.dialog.dir.div.dl.dt.fieldset.figcaption.figure.footer.form.frame.frameset.h1.h2.h3.h4.h5.h6.head.header.hr.html.iframe.legend.li.link.main.menu.menuitem.nav.noframes.ol.optgroup.option.p.param.search.section.summary.table.tbody.td.tfoot.th.thead.title.tr.track.ul`.split(`.`),Lo=`<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*\\/?>`,Ro=`<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>`,zo=RegExp(`^(?:${Lo}|${Ro}|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`),Bo=RegExp(`^(?:${Lo}|${Ro})`),J=[[/^<(script|pre|style|textarea)(?=(\s|>|$))/i,/<\/(script|pre|style|textarea)>/i,!0],[/^<!--/,/-->/,!0],[/^<\?/,/\?>/,!0],[/^<![A-Za-z]/,/>/,!0],[/^<!\[CDATA\[/,/\]\]>/,!0],[RegExp(`^</?(${Io.join(`|`)})(?=(\\s|/?>|$))`,`i`),/^$/,!0],[RegExp(`${Bo.source}\\s*$`),/^$/,!1]];function Vo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4||!e.md.options.html||e.src.charCodeAt(i)!==60)return!1;let o=e.src.slice(i,a),s=0;for(;s<J.length&&!J[s][0].test(o);s++);if(s===J.length)return!1;if(r)return J[s][2];let c=t+1,l=J[s][1].test(``);if(!J[s][1].test(o)){for(;c<n&&!(e.sCount[c]<e.blkIndent&&(l||!e.isEmpty(c)));c++)if(i=e.bMarks[c]+e.tShift[c],a=e.eMarks[c],o=e.src.slice(i,a),J[s][1].test(o)){o.length!==0&&c++;break}}e.line=c;let u=e.push(`html_block`,``,0);return u.map=[t,c],u.content=e.getLines(t,c,e.blkIndent,!0),!0}function Ho(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4)return!1;let o=e.src.charCodeAt(i);if(o!==35||i>=a)return!1;let s=1;for(o=e.src.charCodeAt(++i);o===35&&i<a&&s<=6;)s++,o=e.src.charCodeAt(++i);if(s>6||i<a&&!W(o))return!1;if(r)return!0;a=e.skipSpacesBack(a,i);let c=e.skipCharsBack(a,35,i);c>i&&W(e.src.charCodeAt(c-1))&&(a=c),e.line=t+1;let l=e.push(`heading_open`,`h${s}`,1);l.markup=`########`.slice(0,s),l.map=[t,e.line];let u=e.push(`inline`,``,0);u.content=Na(e.src.slice(i,a)),u.map=[t,e.line],u.children=[];let d=e.push(`heading_close`,`h${s}`,-1);return d.markup=`########`.slice(0,s),!0}function Uo(e,t,n){let r=e.md.block.ruler.getRules(`paragraph`);if(e.sCount[t]-e.blkIndent>=4)return!1;let i=e.parentType;e.parentType=`paragraph`;let a=0,o,s=t+1;for(;s<n&&!e.isEmpty(s);s++){if(e.sCount[s]-e.blkIndent>3)continue;if(e.sCount[s]>=e.blkIndent){let t=e.bMarks[s]+e.tShift[s],n=e.eMarks[s];if(t<n&&(o=e.src.charCodeAt(t),(o===45||o===61)&&(t=e.skipChars(t,o),t=e.skipSpaces(t),t>=n))){a=o===61?1:2;break}}if(e.sCount[s]<0)continue;let t=!1;for(let i=0,a=r.length;i<a;i++)if(r[i](e,s,n,!0)){t=!0;break}if(t)break}if(!a)return e.parentType=i,!1;let c=Na(e.getLines(t,s,e.blkIndent,!1));e.line=s+1;let l=e.push(`heading_open`,`h${a}`,1);l.markup=String.fromCharCode(o),l.map=[t,e.line];let u=e.push(`inline`,``,0);u.content=c,u.map=[t,e.line-1],u.children=[];let d=e.push(`heading_close`,`h${a}`,-1);return d.markup=String.fromCharCode(o),e.parentType=i,!0}function Wo(e,t,n){let r=e.md.block.ruler.getRules(`paragraph`),i=e.parentType,a=t+1;for(e.parentType=`paragraph`;a<n&&!e.isEmpty(a);a++){if(e.sCount[a]-e.blkIndent>3||e.sCount[a]<0)continue;let t=!1;for(let i=0,o=r.length;i<o;i++)if(r[i](e,a,n,!0)){t=!0;break}if(t)break}let o=Na(e.getLines(t,a,e.blkIndent,!1));e.line=a;let s=e.push(`paragraph_open`,`p`,1);s.map=[t,e.line];let c=e.push(`inline`,``,0);return c.content=o,c.map=[t,e.line],c.children=[],e.push(`paragraph_close`,`p`,-1),e.parentType=i,!0}var Go=[[`table`,Eo,[`paragraph`,`reference`]],[`code`,Do],[`fence`,Oo,[`paragraph`,`reference`,`blockquote`,`list`]],[`blockquote`,ko,[`paragraph`,`reference`,`blockquote`,`list`]],[`hr`,Ao,[`paragraph`,`reference`,`blockquote`,`list`]],[`list`,Po,[`paragraph`,`reference`,`blockquote`]],[`reference`,Fo],[`html_block`,Vo,[`paragraph`,`reference`,`blockquote`]],[`heading`,Ho,[`paragraph`,`reference`,`blockquote`]],[`lheading`,Uo],[`paragraph`,Wo]],Ko=class{constructor(){G(this,`ruler`,new Ha),G(this,`State`,So);for(let e=0;e<Go.length;e++)this.ruler.push(Go[e][0],Go[e][1],{alt:(Go[e][2]||[]).slice()})}tokenize(e,t,n){let r=this.ruler.getRules(``),i=r.length,a=e.md.options.maxNesting,o=t,s=!1;for(;o<n&&(e.line=o=e.skipEmptyLines(o),!(o>=n||e.sCount[o]<e.blkIndent));){if(e.level>=a){e.line=n;break}let t=e.line,c=!1;for(let a=0;a<i;a++)if(c=r[a](e,o,n,!1),c){if(t>=e.line)throw Error(`block rule didn't increment state.line`);break}if(!c)throw Error(`none of the block rules matched`);e.tight=!s,e.isEmpty(e.line-1)&&(s=!0),o=e.line,o<n&&e.isEmpty(o)&&(s=!0,o++,e.line=o)}}parse(e,t,n,r){if(!e)return;let i=new this.State(e,t,n,r);this.tokenize(i,i.line,i.lineMax)}},qo=class{constructor(e,t,n,r){G(this,`pos`,0),G(this,`level`,0),G(this,`pending`,``),G(this,`pendingLevel`,0),G(this,`cache`,{}),G(this,`backticks`,{}),G(this,`backticksScanned`,!1),G(this,`linkLevel`,0),G(this,`delimiters`,[]),G(this,`_prev_delimiters`,[]),G(this,`Token`,K),this.src=e,this.env=n,this.md=t,this.tokens=r,this.tokens_meta=Array(r.length),this.posMax=this.src.length}pushPending(){let e=new K(`text`,``,0);return e.content=this.pending,e.level=this.pendingLevel,this.tokens.push(e),this.pending=``,e}push(e,t,n){this.pending&&this.pushPending();let r=new K(e,t,n),i;return n<0&&(this.level--,this.delimiters=this._prev_delimiters.pop()),r.level=this.level,n>0&&(this.level++,this._prev_delimiters.push(this.delimiters),this.delimiters=[],i={delimiters:this.delimiters}),this.pendingLevel=this.level,this.tokens.push(r),this.tokens_meta.push(i),r}scanDelims(e,t){let n=this.posMax,r=this.src.charCodeAt(e),i;if(e===0)i=32;else if(e===1)i=this.src.charCodeAt(0),(i&63488)==55296&&(i=65533);else if(i=this.src.charCodeAt(e-1),(i&64512)==56320){let t=this.src.charCodeAt(e-2);i=(t&64512)==55296?65536+(t-55296<<10)+(i-56320):65533}else (i&64512)==55296&&(i=65533);let a=e;for(;a<n&&this.src.charCodeAt(a)===r;)a++;let o=a-e,s=a<n?this.src.charCodeAt(a):32;if((s&64512)==55296){let e=this.src.charCodeAt(a+1);s=(e&64512)==56320?65536+(s-55296<<10)+(e-56320):65533}else (s&64512)==56320&&(s=65533);let c=Aa(i)||ka(i),l=Aa(s)||ka(s),u=Da(i),d=Da(s),f=!d&&(!l||u||c),p=!u&&(!c||d||l);return{can_open:f&&(t||!p||c),can_close:p&&(t||!f||l),length:o}}};function Jo(e){switch(e){case 10:case 33:case 35:case 36:case 37:case 38:case 42:case 43:case 45:case 58:case 60:case 61:case 62:case 64:case 91:case 92:case 93:case 94:case 95:case 96:case 123:case 125:case 126:return!0;default:return!1}}function Yo(e,t){let n=e.pos;for(;n<e.posMax&&!Jo(e.src.charCodeAt(n));)n++;return n===e.pos?!1:(t||(e.pending+=e.src.slice(e.pos,n)),e.pos=n,!0)}function Xo(e){return e>=65&&e<=90||e>=97&&e<=122}function Zo(e){return e>=65&&e<=90||e>=97&&e<=122||e>=48&&e<=57||e===43||e===45||e===46}function Qo(e,t){if(!e.md.options.linkify||e.linkLevel>0)return!1;let n=e.pos,r=e.posMax;if(n+3>r||e.src.charCodeAt(n)!==58||e.src.charCodeAt(n+1)!==47||e.src.charCodeAt(n+2)!==47)return!1;let i=n-Math.min(10,e.pending.length,n),a=n;for(;a>i&&Zo(e.src.charCodeAt(a-1));)a--;if(a===n||!Xo(e.src.charCodeAt(a)))return!1;let o=n-a,s=e.md.linkify.matchAtStart(e.src.slice(a));if(!s)return!1;let c=s.url;if(c.length<=o)return!1;let l=c.length;for(;l>0&&c.charCodeAt(l-1)===42;)l--;l!==c.length&&(c=c.slice(0,l));let u=e.md.normalizeLink(c);if(!e.md.validateLink(u))return!1;if(!t){e.pending=e.pending.slice(0,-o);let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,u]],t.markup=`linkify`,t.info=`auto`;let n=e.push(`text`,``,0);n.content=e.md.normalizeLinkText(c);let r=e.push(`link_close`,`a`,-1);r.markup=`linkify`,r.info=`auto`}return e.pos+=c.length-o,!0}function $o(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==10)return!1;let r=e.pending.length-1,i=e.posMax;if(!t)if(r>=0&&e.pending.charCodeAt(r)===32)if(r>=1&&e.pending.charCodeAt(r-1)===32){let t=r-1;for(;t>=1&&e.pending.charCodeAt(t-1)===32;)t--;e.pending=e.pending.slice(0,t),e.push(`hardbreak`,`br`,0)}else e.pending=e.pending.slice(0,-1),e.push(`softbreak`,`br`,0);else e.push(`softbreak`,`br`,0);for(n++;n<i&&W(e.src.charCodeAt(n));)n++;return e.pos=n,!0}var es=[];for(let e=0;e<256;e++)es.push(0);`\\!"#$%&'()*+,./:;<=>?@[]^_\`{|}~-`.split(``).forEach(function(e){es[e.charCodeAt(0)]=1});function ts(e,t){let n=e.pos,r=e.posMax;if(e.src.charCodeAt(n)!==92||(n++,n>=r))return!1;let i=e.src.charCodeAt(n);if(i===10){for(t||e.push(`hardbreak`,`br`,0),n++;n<r&&(i=e.src.charCodeAt(n),W(i));)n++;return e.pos=n,!0}if(i===32){if(!t){let t=e.push(`text_special`,``,0);t.content=`\\`,t.markup=`\\`,t.info=`escape`}return e.pos=n,!0}let a=e.src[n];if(i>=55296&&i<=56319&&n+1<r){let t=e.src.charCodeAt(n+1);t>=56320&&t<=57343&&(a+=e.src[n+1],n++)}let o=`\\`+a;if(!t){let t=e.push(`text_special`,``,0);i<256&&es[i]!==0?t.content=a:t.content=o,t.markup=o,t.info=`escape`}return e.pos=n+1,!0}function ns(e){let t={},n=0;for(;(n=e.indexOf("`",n))!==-1;){let r=n;for(;e.charCodeAt(++n)===96;);t[n-r]=r}return t}function rs(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==96)return!1;let r=e.posMax,i=n+1;for(;i<r&&e.src.charCodeAt(i)===96;)i++;let a=e.src.slice(n,i),o=a.length;if(e.backticksScanned||=(e.backticks=ns(e.src),!0),(e.backticks[o]??-1)>=i){let n=i,s;for(;(s=e.src.indexOf("`",n))!==-1&&s<r;){for(n=s+1;e.src.charCodeAt(n)===96;)n++;if(n>r)break;if(n-s===o){if(!t){let t=e.push(`code_inline`,`code`,0);t.markup=a;let n=e.src.slice(i,s).replace(/\n/g,` `);n.startsWith(` `)&&n.endsWith(` `)&&/[^ ]/.test(n)&&(n=n.slice(1,-1)),t.content=n}return e.pos=n,!0}}}return t||(e.pending+=a),e.pos=i,!0}function is(e,t){let n=e.pos,r=e.src.charCodeAt(n);if(t||r!==126)return!1;let i=e.scanDelims(e.pos,!0),a=i.length,o=String.fromCharCode(r);if(a<2)return!1;let s;a%2&&(s=e.push(`text`,``,0),s.content=o,a--);for(let t=0;t<a;t+=2)s=e.push(`text`,``,0),s.content=o+o,e.delimiters.push({marker:r,length:0,token:e.tokens.length-1,end:-1,open:i.can_open,close:i.can_close});return e.pos+=i.length,!0}function as(e,t){let n,r=[],i=t.length;for(let a=0;a<i;a++){let i=t[a];if(i.marker!==126||i.end===-1)continue;let o=t[i.end];n=e.tokens[i.token],n.type=`s_open`,n.tag=`s`,n.nesting=1,n.markup=`~~`,n.content=``,n=e.tokens[o.token],n.type=`s_close`,n.tag=`s`,n.nesting=-1,n.markup=`~~`,n.content=``,e.tokens[o.token-1].type===`text`&&e.tokens[o.token-1].content===`~`&&r.push(o.token-1)}for(;r.length;){let t=r.pop(),i=t+1;for(;i<e.tokens.length&&e.tokens[i].type===`s_close`;)i++;i--,t!==i&&(n=e.tokens[i],e.tokens[i]=e.tokens[t],e.tokens[t]=n)}}function os(e){let t=e.tokens_meta,n=e.tokens_meta.length;as(e,e.delimiters);for(let r=0;r<n;r++){let n=t[r]?.delimiters;n&&as(e,n)}}var ss={tokenize:is,postProcess:os};function cs(e,t){let n=e.pos,r=e.src.charCodeAt(n);if(t||r!==95&&r!==42)return!1;let i=e.scanDelims(e.pos,r===42);for(let t=0;t<i.length;t++){let t=e.push(`text`,``,0);t.content=String.fromCharCode(r),e.delimiters.push({marker:r,length:i.length,token:e.tokens.length-1,end:-1,open:i.can_open,close:i.can_close})}return e.pos+=i.length,!0}function ls(e,t){let n=t.length;for(let r=n-1;r>=0;r--){let n=t[r];if(n.marker!==95&&n.marker!==42||n.end===-1)continue;let i=t[n.end],a=r>0&&t[r-1].end===n.end+1&&t[r-1].marker===n.marker&&t[r-1].token===n.token-1&&t[n.end+1].token===i.token+1,o=String.fromCharCode(n.marker),s=e.tokens[n.token];s.type=a?`strong_open`:`em_open`,s.tag=a?`strong`:`em`,s.nesting=1,s.markup=a?o+o:o,s.content=``;let c=e.tokens[i.token];c.type=a?`strong_close`:`em_close`,c.tag=a?`strong`:`em`,c.nesting=-1,c.markup=a?o+o:o,c.content=``,a&&(e.tokens[t[r-1].token].content=``,e.tokens[t[n.end+1].token].content=``,r--)}}function us(e){let t=e.tokens_meta,n=e.tokens_meta.length;ls(e,e.delimiters);for(let r=0;r<n;r++){let n=t[r]?.delimiters;n&&ls(e,n)}}var ds={tokenize:cs,postProcess:us};function fs(e,t){let n,r,i,a,o=``,s=``,c=e.pos,l=!0;if(e.src.charCodeAt(e.pos)!==91)return!1;let u=e.pos,d=e.posMax,f=e.pos+1,p=e.md.helpers.parseLinkLabel(e,e.pos,!0);if(p<0)return!1;let m=p+1;if(m<d&&e.src.charCodeAt(m)===40){for(l=!1,m++;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);if(m>=d)return!1;if(c=m,i=e.md.helpers.parseLinkDestination(e.src,m,e.posMax),i.ok){for(o=e.md.normalizeLink(i.str),e.md.validateLink(o)?m=i.pos:o=``,c=m;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);if(i=e.md.helpers.parseLinkTitle(e.src,m,e.posMax),m<d&&c!==m&&i.ok)for(s=i.str,m=i.pos;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);}(m>=d||e.src.charCodeAt(m)!==41)&&(l=!0),m++}if(l){if(e.env.references===void 0)return!1;if(m<d&&e.src.charCodeAt(m)===91?(c=m+1,m=e.md.helpers.parseLinkLabel(e,m),m>=0?r=e.src.slice(c,m++):m=p+1):m=p+1,r||=e.src.slice(f,p),r=ja(r),a=e.env.references[r],!a)return e.pos=u,!1;o=a.href,s=a.title}if(!t){e.pos=f,e.posMax=p;let t=e.push(`link_open`,`a`,1),n=[[`href`,o]];if(t.attrs=n,s&&n.push([`title`,s]),r){let e=Object.create(null);e.label=r,t.meta=e}e.linkLevel++,e.md.inline.tokenize(e),e.linkLevel--,e.push(`link_close`,`a`,-1)}return e.pos=m,e.posMax=d,!0}function ps(e,t){let n,r,i,a,o,s,c,l,u=``,d=e.pos,f=e.posMax;if(e.src.charCodeAt(e.pos)!==33||e.src.charCodeAt(e.pos+1)!==91)return!1;let p=e.pos+2,m=e.md.helpers.parseLinkLabel(e,e.pos+1,!1);if(m<0)return!1;if(a=m+1,a<f&&e.src.charCodeAt(a)===40){for(a++;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);if(a>=f)return!1;for(l=a,s=e.md.helpers.parseLinkDestination(e.src,a,e.posMax),s.ok&&(u=e.md.normalizeLink(s.str),e.md.validateLink(u)?a=s.pos:u=``),l=a;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);if(s=e.md.helpers.parseLinkTitle(e.src,a,e.posMax),a<f&&l!==a&&s.ok)for(c=s.str,a=s.pos;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);else c=``;if(a>=f||e.src.charCodeAt(a)!==41)return e.pos=d,!1;a++}else{if(e.env.references===void 0)return!1;if(a<f&&e.src.charCodeAt(a)===91?(l=a+1,a=e.md.helpers.parseLinkLabel(e,a),a>=0?i=e.src.slice(l,a++):a=m+1):a=m+1,i||=e.src.slice(p,m),i=ja(i),o=e.env.references[i],!o)return e.pos=d,!1;u=o.href,c=o.title}if(!t){r=e.src.slice(p,m);let t=[];e.md.inline.parse(r,e.md,e.env,t);let n=e.push(`image`,`img`,0),a=[[`src`,u],[`alt`,``]];if(n.attrs=a,n.children=t,n.content=r,c&&a.push([`title`,c]),i){let e=Object.create(null);e.label=i,n.meta=e}}return e.pos=a,e.posMax=f,!0}var ms=/^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/,hs=/^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;function gs(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==60)return!1;let r=e.pos,i=e.posMax;for(;;){if(++n>=i)return!1;let t=e.src.charCodeAt(n);if(t===60)return!1;if(t===62)break}let a=e.src.slice(r+1,n);if(hs.test(a)){let n=e.md.normalizeLink(a);if(!e.md.validateLink(n))return!1;if(!t){let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,n]],t.markup=`autolink`,t.info=`auto`;let r=e.push(`text`,``,0);r.content=e.md.normalizeLinkText(a);let i=e.push(`link_close`,`a`,-1);i.markup=`autolink`,i.info=`auto`}return e.pos+=a.length+2,!0}if(ms.test(a)){let n=e.md.normalizeLink(`mailto:${a}`);if(!e.md.validateLink(n))return!1;if(!t){let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,n]],t.markup=`autolink`,t.info=`auto`;let r=e.push(`text`,``,0);r.content=e.md.normalizeLinkText(a);let i=e.push(`link_close`,`a`,-1);i.markup=`autolink`,i.info=`auto`}return e.pos+=a.length+2,!0}return!1}function _s(e){return/^<a[>\s]/i.test(e)}function vs(e){return/^<\/a\s*>/i.test(e)}function ys(e){let t=e|32;return t>=97&&t<=122}function bs(e,t){if(!e.md.options.html)return!1;let n=e.posMax,r=e.pos;if(e.src.charCodeAt(r)!==60||r+2>=n)return!1;let i=e.src.charCodeAt(r+1);if(i!==33&&i!==63&&i!==47&&!ys(i))return!1;let a=e.src.slice(r).match(zo);if(!a)return!1;if(!t){let t=e.push(`html_inline`,``,0);t.content=a[0],_s(t.content)&&e.linkLevel++,vs(t.content)&&e.linkLevel--}return e.pos+=a[0].length,!0}var xs=/^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i,Ss=/^&([a-z][a-z0-9]{1,31});/i;function Cs(e,t){let n=e.pos,r=e.posMax;if(e.src.charCodeAt(n)!==38||n+1>=r)return!1;if(e.src.charCodeAt(n+1)===35){let r=e.src.slice(n).match(xs);if(r){if(!t){let t=r[1][0].toLowerCase()===`x`?parseInt(r[1].slice(1),16):parseInt(r[1],10),n=e.push(`text_special`,``,0);n.content=ma(t)?ha(t):ha(65533),n.markup=r[0],n.info=`entity`}return e.pos+=r[0].length,!0}}else{let r=e.src.slice(n).match(Ss);if(r){let n=Ai(r[0]);if(n!==r[0]){if(!t){let t=e.push(`text_special`,``,0);t.content=n,t.markup=r[0],t.info=`entity`}return e.pos+=r[0].length,!0}}}return!1}function ws(e){let t={},n=e.length;if(!n)return;let r=0,i=-2,a=[];for(let o=0;o<n;o++){let n=e[o];if(a.push(0),(e[r].marker!==n.marker||i!==n.token-1)&&(r=o),i=n.token,n.length=n.length||0,!n.close)continue;t.hasOwnProperty(n.marker)||(t[n.marker]=[-1,-1,-1,-1,-1,-1]);let s=t[n.marker][(n.open?3:0)+n.length%3],c=r-a[r]-1,l=c;for(;c>s;c-=a[c]+1){let t=e[c];if(t.marker===n.marker&&t.open&&t.end<0){let r=!1;if((t.close||n.open)&&(t.length+n.length)%3==0&&(t.length%3!=0||n.length%3!=0)&&(r=!0),!r){let r=c>0&&!e[c-1].open?a[c-1]+1:0;a[o]=o-c+r,a[c]=r,n.open=!1,t.end=o,t.close=!1,l=-1,i=-2;break}}}l!==-1&&(t[n.marker][(n.open?3:0)+(n.length||0)%3]=l)}}function Ts(e){let t=e.tokens_meta,n=e.tokens_meta.length;ws(e.delimiters);for(let e=0;e<n;e++){let n=t[e]?.delimiters;n&&ws(n)}}function Es(e){let t,n,r=0,i=e.tokens,a=e.tokens.length;for(t=n=0;t<a;t++)i[t].nesting<0&&r--,i[t].level=r,i[t].nesting>0&&r++,i[t].type===`text`&&t+1<a&&i[t+1].type===`text`?i[t+1].content=i[t].content+i[t+1].content:(t!==n&&(i[n]=i[t]),n++);t!==n&&(i.length=n)}var Ds=[[`text`,Yo],[`linkify`,Qo],[`newline`,$o],[`escape`,ts],[`backticks`,rs],[`strikethrough`,ss.tokenize],[`emphasis`,ds.tokenize],[`link`,fs],[`image`,ps],[`autolink`,gs],[`html_inline`,bs],[`entity`,Cs]],Os=[[`balance_pairs`,Ts],[`strikethrough`,ss.postProcess],[`emphasis`,ds.postProcess],[`fragments_join`,Es]],ks=class{constructor(){G(this,`ruler`,new Ha),G(this,`ruler2`,new Ha),G(this,`State`,qo);for(let e=0;e<Ds.length;e++)this.ruler.push(Ds[e][0],Ds[e][1]);for(let e=0;e<Os.length;e++)this.ruler2.push(Os[e][0],Os[e][1])}skipToken(e){let t=e.pos,n=this.ruler.getRules(``),r=n.length,i=e.md.options.maxNesting,a=e.cache;if(a[t]!==void 0){e.pos=a[t];return}let o=!1;if(e.level<i){for(let i=0;i<r;i++)if(e.level++,o=n[i](e,!0),e.level--,o){if(t>=e.pos)throw Error(`inline rule didn't increment state.pos`);break}}else e.pos=e.posMax;o||e.pos++,a[t]=e.pos}tokenize(e){let t=this.ruler.getRules(``),n=t.length,r=e.posMax,i=e.md.options.maxNesting;for(;e.pos<r;){let a=e.pos,o=!1;if(e.level<i){for(let r=0;r<n;r++)if(o=t[r](e,!1),o){if(a>=e.pos)throw Error(`inline rule didn't increment state.pos`);break}}if(o){if(e.pos>=r)break;continue}e.pending+=e.src[e.pos++]}e.pending&&e.pushPending()}parse(e,t,n,r){let i=new this.State(e,t,n,r);this.tokenize(i);let a=this.ruler2.getRules(``),o=a.length;for(let e=0;e<o;e++)a[e](i)}},As={default:{options:{html:!1,xhtmlOut:!1,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:100},components:{core:{},block:{},inline:{}}},zero:{options:{html:!1,xhtmlOut:!1,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:20},components:{core:{rules:[`normalize`,`block`,`strip_references`,`inline`,`text_join`]},block:{rules:[`paragraph`]},inline:{rules:[`text`],rules2:[`balance_pairs`,`fragments_join`]}}},commonmark:{options:{html:!0,xhtmlOut:!0,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:20},components:{core:{rules:[`normalize`,`block`,`strip_references`,`inline`,`text_join`]},block:{rules:[`blockquote`,`code`,`fence`,`heading`,`hr`,`html_block`,`lheading`,`list`,`reference`,`paragraph`]},inline:{rules:[`autolink`,`backticks`,`emphasis`,`entity`,`escape`,`html_inline`,`image`,`link`,`newline`,`text`],rules2:[`balance_pairs`,`emphasis`,`fragments_join`]}}}},js=/^(vbscript|javascript|file|data):/,Ms=/^data:image\/(gif|png|jpeg|webp);/,Ns=[`http:`,`https:`,`mailto:`],Y=class{validateLink(e){let t=e.trim().toLowerCase();return js.test(t)?Ms.test(t):!0}normalizeLink(e){let t=$r(e,!0);if(t.hostname&&(!t.protocol||Ns.indexOf(t.protocol)>=0))try{t.hostname=ca.toASCII(t.hostname)}catch{}return t.auth&&=P(t.auth),t.hostname&&=P(t.hostname),t.pathname&&=P(t.pathname),t.search&&=P(t.search),t.hash&&=P(t.hash),Vr(t)}normalizeLinkText(e){let t=$r(e,!0);if(t.hostname&&(!t.protocol||Ns.indexOf(t.protocol)>=0))try{t.hostname=ca.toUnicode(t.hostname)}catch{}return N(Vr(t),N.defaultChars+`%`)}constructor(...e){G(this,`inline`,new ks),G(this,`block`,new Ko),G(this,`core`,new xo),G(this,`renderer`,new Ua),G(this,`linkify`,new zi),G(this,`utils`,da),G(this,`helpers`,Object.assign({},Ra));let[t,n]=e;typeof t==`string`?(this.configure(t),n&&this.set(n)):(this.configure(`default`),this.set(t||{}))}set(e){return Object.assign(this.options,e),this}configure(e){let t;if(typeof e==`string`){let n=e;if(t=As[n],!t)throw Error(`Wrong 'markdown-it' preset "${n}", check name`)}else t=e;if(!t)throw Error("Wrong `markdown-it` preset, can't be empty");t.options&&(this.options={...t.options});let n=t.components;if(n){[`core`,`block`,`inline`].forEach(e=>{let t=n[e]?.rules;t&&this[e].ruler.enableOnly(t)});let e=n.inline?.rules2;e&&this.inline.ruler2.enableOnly(e)}return this}enable(e,t=!1){let n=[];Array.isArray(e)||(e=[e]),[`core`,`block`,`inline`].forEach(t=>{n=n.concat(this[t].ruler.enable(e,!0))}),n=n.concat(this.inline.ruler2.enable(e,!0));let r=e.filter(e=>n.indexOf(e)<0);if(r.length&&!t)throw Error(`MarkdownIt. Failed to enable unknown rule(s): ${r}`);return this}disable(e,t=!1){let n=[];Array.isArray(e)||(e=[e]),[`core`,`block`,`inline`].forEach(t=>{n=n.concat(this[t].ruler.disable(e,!0))}),n=n.concat(this.inline.ruler2.disable(e,!0));let r=e.filter(e=>n.indexOf(e)<0);if(r.length&&!t)throw Error(`MarkdownIt. Failed to disable unknown rule(s): ${r}`);return this}use(e,...t){return e.apply(e,[this,...t]),this}parse(e,t){if(typeof e!=`string`)throw Error(`Input data should be a String`);let n=new this.core.State(e,this,t);return this.core.process(n),n.tokens}render(e,t={}){return this.renderer.render(this.parse(e,t),this.options,t)}parseInline(e,t){let n=new this.core.State(e,this,t);return n.inlineMode=!0,this.core.process(n),n.tokens}renderInline(e,t={}){return this.renderer.render(this.parseInline(e,t),this.options,t)}};G(Y,`Token`,K),G(Y,`Ruler`,Ha),G(Y,`Renderer`,Ua),G(Y,`ParserCore`,xo),G(Y,`StateCore`,Wa),G(Y,`ParserBlock`,Ko),G(Y,`StateBlock`,So),G(Y,`ParserInline`,ks),G(Y,`StateInline`,qo);var Ps=fa(Y),Fs=`<span class="doc-external-glyph" aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>`;function Is(e,t){let{file:n,pageUrl:r,library:i}=t,a=e.attrGet(`href`);if(a===null||n===void 0||i===void 0)return!1;let o=jt(String(a),n,i);return o.kind===`page`?(e.attrSet(`href`,o.page.url+o.hash),e.attrSet(`data-doc-link`,``),!1):o.kind===`hash`?(e.attrSet(`href`,(r??``)+o.hash),e.attrSet(`data-doc-link`,``),!1):(e.attrSet(`href`,o.href),o.opensNewTab?(e.attrSet(`target`,`_blank`),e.attrSet(`rel`,`noopener noreferrer`),!0):!1)}function Ls(e){let t=e.env;for(let n of e.tokens){if(n.type!==`inline`||!n.children)continue;let r=n.children;for(let n=r.length-1;n>=0;--n){let i=r[n];if(i){if(i.type===`image`&&t.file!==void 0){let e=String(i.attrGet(`src`)??``);i.attrSet(`src`,Mt(e,t.file,t.imageUrls??{}))}else if(i.type===`link_open`){if(!Is(i,t))continue;let a=r.findIndex((e,t)=>t>n&&e.type===`link_close`);if(a===-1)continue;let o=new e.Token(`html_inline`,``,0);o.content=Fs,r.splice(a+1,0,o)}}}}}function Rs(e){let t=e.renderer.rules.fence,n=e.renderer.rules.table_open,r=e.renderer.rules.table_close,i=e.utils.escapeHtml,a=e=>`<div class="doc-nested-scroll" role="group" tabindex="0" aria-label="${i(e)}">`;e.renderer.rules.fence=(e,n,r,i,o)=>{let s=e[n].info.trim().split(/\s+/)[0]??``,c=t?t(e,n,r,i,o):``;return`${a(`${s||`Code`} code`)}${c}</div>`},e.renderer.rules.table_open=(e,t,r,i,o)=>{let s=e[t],c=n?n(e,t,r,i,o):o.renderToken(e,t,r);return s.level===0?c:`${a(`Table`)}${c}`},e.renderer.rules.table_close=(e,t,n,i,a)=>{let o=e[t],s=r?r(e,t,n,i,a):a.renderToken(e,t,n);return o.level===0?s:`${s}</div>`}}function zs(){let e=Ps({html:!1,linkify:!1,typographer:!1,breaks:!1});return e.core.ruler.push(`docs_rewrite_links`,Ls),Rs(e),e}var X=zs();function Bs(e){return e.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu,``).replace(/ /g,`-`)}function Vs(){let e=new Set,t=new Map;return n=>{let r=Bs(n),i=r,a=t.get(r)??0;for(;e.has(i);)a+=1,i=`${r}-${a}`;return t.set(r,a),e.add(i),i}}function Hs(e){return e?.children?e.children.map(e=>e.type===`text`||e.type===`code_inline`||e.type===`image`?e.content:e.type===`softbreak`||e.type===`hardbreak`?` `:``).join(``):e?.content??``}function Us(e){let t=X.parse(e.markdown,{}),n=Vs(),r=[],i={id:e.path,pagePath:e.path,pageTitle:e.title,groupKey:e.groupKey,groupTitle:e.groupTitle,heading:e.title,headingId:``,text:``},a=[],o=!1;function s(){i.text=a.join(` `).replace(/\s+/g,` `).trim(),a.length=0,(i.text!==``||i.headingId!==``)&&r.push(i)}return t.forEach((r,c)=>{if(r.type===`heading_open`){let a=t[c+1],l=a?Hs(a):``,u=n(l);if(r.tag===`h1`&&!o){o=!0;return}s(),i={...i,id:`${e.path}#${u}`,heading:l,headingId:u,text:``};return}let l=t[c-1]?.type===`heading_open`;r.type===`inline`&&!l?a.push(Hs(r)):r.type===`fence`&&r.info.trim()!==`mermaid`&&a.push(r.content)}),s(),r}function Ws(e,t){let n=[];for(let r of ce(e,{minimumWordLength:2})){let e=de(t,r);e.length>0&&n.push({word:r,alsoSearching:e})}return n}var Gs=40;function Ks(e){let t=e.pages.flatMap(e=>Us(e)).map(e=>fe(e,[{name:`heading`,text:e.heading,weight:3},{name:`pageTitle`,text:e.pageTitle,weight:2},{name:`text`,text:e.text,weight:1}]));return{search(n){let r=Ws(n,e.synonyms),i=le(t,n,{synonyms:e.synonyms,minimumWordLength:2,requireEveryWord:!1});return i.sort((e,t)=>t.matchedWordCount-e.matchedWordCount||t.score-e.score),{hits:i.slice(0,Gs).map(e=>({section:e.item,score:e.score,matchedTerms:e.matchedTerms,snippet:$t(e.item.text,e.matchedTerms)})),totalHits:i.length,expansions:r}}}}function qs(e,t){let n=null;return{outcome:p(()=>{let r=t.value.trim();return r===``?null:(n??=Ks(e),n.search(r))})}}function Js(e){r(e,e=>{document.title=`${e} · Docs · Sentinel`},{immediate:!0,flush:`post`})}function Z(e){return he.sanitize(e,{ADD_ATTR:[`target`]})}var Ys=/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i,Xs=/^Figure:\s*/i,Zs=/^In words:?$/i;function Qs(e){let t=[],n=null;for(let r of e)n?(n.push(r),r.nesting===-1&&r.level===0&&(t.push(n),n=null)):r.nesting===1?n=[r]:t.push([r]);return t}function $s(e,t){return X.renderer.render(e,X.options,t)}function ec(e){return e?.children?.filter(e=>!(e.type===`text`&&e.content===``))}function tc(e){return e[0]?.type===`paragraph_open`?e[1]:void 0}function nc(e){let t=ec(tc(e));return!t||t.length!==3||t[0]?.type!==`em_open`||t[2]?.type!==`em_close`?null:t[1]?.content??null}function rc(e){let t=ec(tc(e));return!t||t.length!==3?!1:t[0]?.type===`strong_open`&&t[2]?.type===`strong_close`&&Zs.test(t[1]?.content??``)}function ic(e){let t=e[0]?.type;return t===`bullet_list_open`||t===`ordered_list_open`||t===`table_open`}function ac(e){if(e[0]?.type!==`blockquote_open`)return null;let t=e[1],n=e[2]?.children;if(t?.type!==`paragraph_open`||!n?.length)return null;let r=n[0],i=r?.type===`text`?Ys.exec(r.content):null;return i?.[1]?(n.shift(),n[0]?.type===`softbreak`&&n.shift(),n.length===0&&e.splice(1,3),i[1].toLowerCase()):null}function oc(e){let t=ec(tc(e)),n=t?.length===1?t[0]:void 0;if(n?.type!==`image`)return null;let r=X.utils.escapeHtml,i=r(String(n.attrGet(`src`)??``)),a=r(n.content),o=String(n.attrGet(`title`)??``);return`<figure class="doc-figure"><a href="${i}" target="_blank" rel="noopener noreferrer" aria-label="${a===``?`Open image full size`:`${a} (opens full size)`}"><img src="${i}" alt="${a}"></a>`+(o?`<figcaption>${r(o)}</figcaption>`:``)+`</figure>`}function Q(e){return e.groups[e.index]}function $(e){return e[0]}function sc(e){let t=e?.[0];return t?.type===`fence`&&t.info.trim()===`mermaid`}var cc=e=>{let t=Q(e),n=$(t);if(n.type!==`heading_open`)return null;let r=t[1],i=Hs(r),a=e.slugify(i);return e.index===e.pageHeadingIndex?{blocks:[],pageHeadingId:a}:{blocks:[{kind:`heading`,level:Math.min(Math.max(Number(n.tag.slice(1)),2),6),id:a,html:Z(X.renderer.renderInline(r?.children??[],X.options,e.environment)),text:i}]}},lc=e=>{let t=Q(e);if(!sc(t))return null;let n=uc(e.groups[e.index-1]),r=e.groups[e.index+1],i=e.groups[e.index+2],a=r!==void 0&&i!==void 0&&rc(r)&&ic(i);return{blocks:[{kind:`diagram`,source:$(t).content.trimEnd(),caption:n?.replace(Xs,``)??``,textHtml:a?Z($s(i,e.environment)):``}],consumedGroups:a?2:0}};function uc(e){if(!e)return null;let t=nc(e);return t!==null&&Xs.test(t)?t:null}var dc=[cc,lc,e=>{let t=$(Q(e));return t.type===`fence`?{blocks:[{kind:`code`,language:t.info.trim().split(/\s+/)[0]??``,code:t.content.replace(/\n$/,``)}]}:null},e=>{let t=Q(e);return $(t).type===`table_open`?{blocks:[{kind:`table`,html:Z($s(t,e.environment)),label:`${e.nearestHeadingText} table`.trim()}]}:null},e=>{let t=Q(e),n=ac(t);return n===null?null:{blocks:[{kind:`callout`,variant:n,html:Z($s(t.slice(1,-1),e.environment))}]}},e=>{let t=oc(Q(e));return t===null?null:{blocks:[{kind:`html`,html:Z(t)}]}},e=>uc(Q(e))===null?null:sc(e.groups[e.index+1])?{blocks:[]}:null,e=>{let t=Z($s(Q(e),e.environment));return{blocks:t.trim()===``?[]:[{kind:`html`,html:t}]}}];function fc(e){let t=[];for(let n of e){let e=t[t.length-1];n.kind===`html`&&e?.kind===`html`?t[t.length-1]={kind:`html`,html:e.html+n.html}:t.push(n)}return t}function pc(e){return e.flatMap(e=>e.kind===`heading`&&(e.level===2||e.level===3)?[{id:e.id,level:e.level,text:e.text}]:[])}function mc(e,t){let n=Qs(X.parse(e,t)),r=Vs(),i=n.findIndex(e=>$(e).type===`heading_open`&&$(e).tag===`h1`),a=[],o=``,s=Hs(n[i]?.[1]);for(let e=0;e<n.length;e+=1){let c={groups:n,index:e,environment:t,slugify:r,pageHeadingIndex:i,nearestHeadingText:s};for(let t of dc){let n=t(c);if(n===null)continue;a.push(...n.blocks),o=n.pageHeadingId??o,e+=n.consumedGroups??0;let r=n.blocks.find(e=>e.kind===`heading`);r?.kind===`heading`&&(s=r.text);break}}let c=fc(a);return{headingId:o,blocks:c,outline:pc(c)}}var hc={key:0,class:`doc-sidebar`,"aria-label":`Documentation navigation`},gc={class:`doc-sidebar__search`},_c={class:`doc-column`},vc={class:`doc-topbar`},yc={class:`doc-content__header`},bc={class:`doc-content__body`},xc={class:`doc-content__toc`},Sc=k(t({__name:`DocsPage`,setup(e){let t=A(),{closeDocs:d}=at(),{library:h,pagePath:g,page:v,activeGroup:b,query:C,searchActive:T,hashId:ee,setQuery:D}=Fr(),te=qs(h,p(()=>T.value?C.value:``));Ir(te.outcome,T);let ne=p(()=>!T.value&&v.value===void 0),O=p(()=>{let e=v.value;return e?mc(e.markdown,{file:e.file,pageUrl:e.url,library:h,imageUrls:Mr}):null}),re=p(()=>v.value?.url??`/doc/`),ie=p(()=>Tn(h,g.value)),ae=p(()=>T.value?`SEARCH RESULTS`:v.value?v.value.title:`PAGE NOT FOUND`),oe=p(()=>T.value?`Search results`:v.value?v.value.title:`Page not found`),se=p(()=>{let e=v.value;return T.value||!e?[{label:`Docs`,to:`/doc/`},{label:T.value?`Search`:`Page not found`}]:[{label:e.groupTitle,to:b.value?.pages[0]?.url??`/doc/`},{label:e.title}]});Js(oe);let k=i(null),ce=i(null),le=i(null),ue=i(null),de=i(null),fe=i(!1);hn(p(()=>`${g.value}|${T.value}`),ee,ne,{scrollRegions:p(()=>[ce.value,le.value]),findPageHeading:()=>k.value?.querySelector(`h1`)??null,findAnchorTarget:e=>{let t=document.getElementById(e);return t&&k.value?.contains(t)?t:null}}),r(g,()=>{fe.value=!1});function pe(e){let t=e.target;t instanceof HTMLElement&&t.closest(`input, textarea, select, [contenteditable]`)||e.defaultPrevented||d()}return _(()=>t.setActive(!0)),S(()=>t.setActive(!1)),(e,r)=>(y(),x(`div`,{ref_key:`rootRef`,ref:k,class:`doc-page theme-light light-island`,"data-testid":`docs-page`,onKeydown:n(pe,[`esc`])},[u(t).sidebarOpen?(y(),a(mt,{key:0,groups:u(h).groups,"active-group-key":u(b)?.key},null,8,[`groups`,`active-group-key`])):c(``,!0),s(`div`,{ref_key:`bodyRef`,ref:ce,class:E([`doc-body`,{"doc-body--no-sidebar":!u(t).sidebarOpen}])},[u(t).sidebarOpen?(y(),x(`aside`,hc,[s(`div`,gc,[l(bt,{ref_key:`searchFieldRef`,ref:ue,"model-value":u(C),"onUpdate:modelValue":u(D),onFocusResults:r[0]||=e=>de.value?.focusFirst()},null,8,[`model-value`,`onUpdate:modelValue`])]),l(lt,{open:fe.value,"onUpdate:open":r[1]||=e=>fe.value=e,label:`Pages in ${u(b)?.title??`Docs`}`,"collapse-below":`tablet`},{default:w(()=>[l(Wt,{group:u(b)??u(h).groups[0],"current-path":u(g)},null,8,[`group`,`current-path`])]),_:1},8,[`open`,`label`])])):c(``,!0),s(`div`,_c,[s(`div`,vc,[l(it,{trail:se.value},null,8,[`trail`]),l(ot)]),s(`div`,{ref_key:`mainRef`,ref:le,class:`doc-main`},[s(`div`,{class:E([`doc-content`,{"doc-content--page":O.value&&!u(T)}])},[s(`div`,yc,[l(gt,{id:u(T)?void 0:O.value?.headingId},{default:w(()=>[m(f(ae.value),1)]),_:1},8,[`id`])]),u(T)?(y(),a(mn,{key:0,ref_key:`searchResultsRef`,ref:de,class:`doc-content__body`,query:u(C),outcome:u(te).outcome.value,library:u(h),onFocusField:r[2]||=e=>ue.value?.focus()},null,8,[`query`,`outcome`,`library`])):O.value?(y(),x(o,{key:2},[s(`div`,bc,[(y(),a(tt,{key:u(v)?.url,blocks:O.value.blocks},null,8,[`blocks`])),l(Yt,{previous:ie.value.previous,next:ie.value.next},null,8,[`previous`,`next`])]),s(`div`,xc,[l(Et,{entries:O.value.outline,"page-url":re.value},null,8,[`entries`,`page-url`])])],64)):(y(),a(St,{key:1,class:`doc-content__body`,"requested-path":u(g),onSearch:u(D)},null,8,[`requested-path`,`onSearch`]))],2)],512)])],2),l(vt)],544))}}),[[`__scopeId`,`data-v-5a9bccd0`]]);export{Sc as default};