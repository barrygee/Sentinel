const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["spa-assets/mermaid.core-Kz0Iw3L6.js","spa-assets/vite-preload-helper-zJ_50EbN.js","spa-assets/chunk-PWAF6VOD-OPovV9E-.js","spa-assets/src-C44w8LJe.js","spa-assets/rolldown-runtime-QTnfLwEv.js","spa-assets/chunk-Y2CYZVJY-DsF7k-Jl.js","spa-assets/chunk-DU6HZSFF-o_UkBJwL.js","spa-assets/purify.es-F_7NWVtX.js","spa-assets/chunk-75Z2AOVW-C0FVKb5g.js","spa-assets/dist-D9sYb5Oa.js","spa-assets/chunk-GMAD6QVW-C16H8jf_.js","spa-assets/chunk-2E4U76K2-VJzWexOh.js","spa-assets/graphlib-B8gBHxth.js","spa-assets/chunk-4HAMMTFA-DTnfzTj1.js","spa-assets/chunk-P2QGCYS3-B9xFPCnT.js","spa-assets/rough.esm-CSKSodPl.js","spa-assets/chunk-GVQU2GXP-CK9tPnId.js","spa-assets/chunk-L3NEJ4N5-g7ENezSA.js","spa-assets/chunk-OSK3NFVY-9QNFCMm4.js","spa-assets/line-CkrT1ceS.js","spa-assets/path-BWPyau1x.js","spa-assets/array-BifhSqXX.js","spa-assets/chunk-CLGD4ZFX-Ca3GLlYJ.js","spa-assets/chunk-LNGE3PJU-OosUmKKA.js","spa-assets/chunk-TLUHSLCS-BBJx4KVo.js"])))=>i.map(i=>d[i]);
import{n as e}from"./rolldown-runtime-QTnfLwEv.js";import{$ as t,A as n,C as r,F as i,G as a,H as o,J as s,K as c,Q as l,R as u,S as d,V as f,W as p,X as m,Z as h,_ as g,c as _,f as v,g as y,m as b,o as x,q as S,u as C,v as w,w as T,x as ee,y as te,z as E}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__pinia__loadShare__.js-CWWFmord.js";import{n as D,t as ne}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__vue_mf_2_router__loadShare__.js-CiqbY0-n.js";import{Tt as O,_ as re,ft as ie,n as ae,q as oe,v as se}from"./_virtual_mf___mfe_internal__sentinel_shell__mf_owner__261401875018842__loadShare__shared-Cl-FB55C.js";import{t as ce}from"./vite-preload-helper-zJ_50EbN.js";import{t as k}from"./_plugin-vue_export-helper-BDNMzG2s.js";import{a as le,i as ue,n as de,o as fe,r as pe,s as me,t as he}from"./index-DU3eSB83.js";import{t as ge}from"./purify.es-F_7NWVtX.js";var _e={class:`doc-callout__label`},ve={key:0,class:`doc-callout__glyph`,width:`14`,height:`14`,viewBox:`0 0 14 14`,fill:`none`,"aria-hidden":`true`},ye={key:1,class:`doc-callout__dot`,"aria-hidden":`true`},be={class:`doc-callout__body`},xe=k(t({__name:`DocsCallout`,props:{variant:{}},setup(e){let t=e,n=p(()=>t.variant.toUpperCase()),r=p(()=>t.variant===`warning`||t.variant===`caution`);return(t,i)=>(b(),S(`aside`,{class:E([`doc-callout`,`doc-callout--${e.variant}`]),role:`note`},[s(`p`,_e,[r.value?(b(),S(`svg`,ve,[...i[0]||=[s(`circle`,{cx:`7`,cy:`7`,r:`6.2`,stroke:`currentColor`,"stroke-width":`1.4`},null,-1),s(`line`,{x1:`7`,y1:`3.8`,x2:`7`,y2:`7.6`,stroke:`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`},null,-1),s(`circle`,{cx:`7`,cy:`10`,r:`0.9`,fill:`currentColor`},null,-1)]])):(b(),S(`span`,ye)),h(` `+f(n.value),1)]),s(`div`,be,[g(t.$slots,`default`,{},void 0,!0)])],2))}}),[[`__scopeId`,`data-v-00149f2c`]]);async function Se(e){if(navigator.clipboard?.writeText)try{return await navigator.clipboard.writeText(e),!0}catch{}let t=document.activeElement,n=document.createElement(`textarea`);n.value=e,n.setAttribute(`readonly`,``),n.style.position=`fixed`,n.style.opacity=`0`,document.body.appendChild(n),n.select();try{return document.execCommand(`copy`)}catch{return!1}finally{n.remove(),t instanceof HTMLElement&&t.focus()}}var Ce={class:`doc-code`},we={class:`doc-code__bar`},Te={class:`doc-code__language`},Ee=[`aria-label`],De=2e3,Oe=k(t({__name:`DocsCodeBlock`,props:{code:{},language:{}},setup(e){let t=e,n=me(),r=i(null),a=i(`idle`),o;function c(){let e=r.value,t=window.getSelection();if(!e||!t)return;let n=document.createRange();n.selectNodeContents(e),t.removeAllRanges(),t.addRange(n)}async function u(){await Se(t.code)?(a.value=`copied`,n.announce(`Copied to clipboard`)):(c(),a.value=`select`,n.announce(`Code selected. Press Control or Command and C to copy.`)),clearTimeout(o),o=setTimeout(()=>{a.value=`idle`},De)}C(()=>clearTimeout(o));let d={idle:`COPY`,copied:`COPIED`,select:`SELECT AND COPY`};return(t,n)=>(b(),S(`figure`,Ce,[s(`div`,we,[s(`span`,Te,f(e.language||`code`),1),l(oe,{class:`doc-code__copy`,variant:`ghost`,onClick:u},{default:T(()=>[h(f(d[a.value]),1)]),_:1})]),s(`pre`,{ref_key:`preRef`,ref:r,tabindex:`0`,role:`group`,"aria-label":`${e.language||`Code`} code`},[s(`code`,null,f(e.code),1)],8,Ee)]))}}),[[`__scopeId`,`data-v-07c4c065`]]),ke={background:`#f6f6f4`,primaryColor:`#e8eaed`,primaryBorderColor:`#5c5f66`,primaryTextColor:`#16191d`,lineColor:`#4a4d55`,secondaryColor:`#ffffff`,tertiaryColor:`#f1efe9`,fontFamily:`'Barlow', 'Helvetica Neue', Arial, sans-serif`,fontSize:`14px`},Ae=`
  .node.accent rect, .node.accent polygon, .node.accent circle, .node.accent ellipse, .node.accent path {
    stroke: #446b00 !important;
    stroke-width: 2px !important;
    fill: rgba(200, 255, 0, 0.25) !important;
  }
`,je,Me=0;function Ne(){return je??=ce(async()=>{let{default:e}=await import(`./mermaid.core-Kz0Iw3L6.js`);return{default:e}},__vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24])).then(({default:e})=>(e.initialize({startOnLoad:!1,theme:`base`,themeVariables:ke,themeCSS:Ae,securityLevel:`strict`,htmlLabels:!1,flowchart:{htmlLabels:!1,useMaxWidth:!0},logLevel:`fatal`}),e)),je}async function Pe(e,t){let n=await Ne();await n.parse(e),Me+=1;let{svg:r}=await n.render(`doc-diagram-${Me}`,e),i=document.createElement(`div`);i.innerHTML=ge.sanitize(r,{USE_PROFILES:{svg:!0,svgFilters:!0}});let a=i.querySelector(`svg`);if(!a)throw Error(`Mermaid returned no SVG`);return a.setAttribute(`role`,`img`),a.setAttribute(`aria-label`,t),a.removeAttribute(`aria-roledescription`),a.removeAttribute(`aria-labelledby`),a.removeAttribute(`aria-describedby`),a.querySelectorAll(`:scope > title, :scope > desc`).forEach(e=>e.remove()),a}var Fe={class:`doc-diagram-block`},Ie={class:`doc-diagram`},Le={key:0,class:`doc-diagram__loading`,"aria-busy":`true`},Re={key:1,class:`doc-diagram__scroll`,role:`region`,tabindex:`0`,"aria-label":`Diagram`},ze={key:3,class:`doc-diagram__caption`},Be=[`innerHTML`],Ve=k(t({__name:`DocsDiagram`,props:{source:{},caption:{},textHtml:{}},setup(e){let t=e,n=i(`loading`),r=i(null);return v(async()=>{try{let e=await Pe(t.source,t.caption||`Diagram`);n.value=`ready`,await _(),r.value?.replaceChildren(e)}catch{n.value=`failed`}}),(t,i)=>(b(),S(`div`,Fe,[s(`figure`,Ie,[n.value===`loading`?(b(),S(`div`,Le,` LOADING DIAGRAM `)):n.value===`ready`?(b(),S(`div`,Re,[s(`div`,{ref_key:`canvasRef`,ref:r,class:`doc-diagram__canvas`},null,512)])):(b(),S(o,{key:2},[l(xe,{variant:`warning`},{default:T(()=>[...i[0]||=[s(`p`,null,`This diagram couldn't be drawn; its text version follows.`,-1)]]),_:1}),l(Oe,{language:`mermaid`,code:e.source},null,8,[`code`])],64)),e.caption?(b(),S(`figcaption`,ze,f(e.caption),1)):c(``,!0)]),e.textHtml?(b(),S(`div`,{key:0,class:`doc-diagram-text`,innerHTML:e.textHtml},null,8,Be)):c(``,!0)]))}}),[[`__scopeId`,`data-v-4cddd09a`]]),He=[`href`,`aria-label`],Ue=k(t({__name:`DocsHeadingAnchor`,props:{headingId:{},headingText:{}},setup(e){let t=e,n=ne(),r=D(),i=me();async function a(e){e.preventDefault();let a={path:n.path,query:n.query,hash:`#${t.headingId}`},o=r.resolve(a);r.replace(a),await Se(new URL(o.href,window.location.origin).href)&&i.announce(`Link to section copied`)}return(t,n)=>(b(),S(`a`,{class:`doc-anchor`,href:`#${e.headingId}`,"aria-label":`Link to section: ${e.headingText}`,onClick:a},[...n[0]||=[s(`svg`,{width:`14`,height:`14`,viewBox:`0 0 14 14`,fill:`none`,"aria-hidden":`true`},[s(`path`,{d:`M6 8a2.4 2.4 0 0 0 3.4 0l2-2A2.4 2.4 0 0 0 8 2.6L7.2 3.4M8 6a2.4 2.4 0 0 0-3.4 0l-2 2A2.4 2.4 0 0 0 6 11.4l.8-.8`,stroke:`currentColor`,"stroke-width":`1.4`,"stroke-linecap":`round`,"stroke-linejoin":`round`})],-1)]],8,He))}}),[[`__scopeId`,`data-v-08ec1cc7`]]),We=[`innerHTML`],Ge=k(t({__name:`DocsSectionHeading`,props:{level:{},id:{},html:{},text:{}},setup(e){let t=e,n=p(()=>`h${t.level}`),r=p(()=>t.level<=4);return(t,i)=>(b(),a(te(n.value),{id:e.id,class:E([`doc-section-heading`,`doc-section-heading--h${e.level}`]),tabindex:`-1`},{default:T(()=>[s(`span`,{innerHTML:e.html},null,8,We),r.value?(b(),a(Ue,{key:0,"heading-id":e.id,"heading-text":e.text},null,8,[`heading-id`,`heading-text`])):c(``,!0)]),_:1},8,[`id`,`class`]))}}),[[`__scopeId`,`data-v-e6c99aca`]]),Ke=[`aria-label`],qe=[`innerHTML`],Je=k(t({__name:`DocsTableScroll`,props:{html:{},label:{}},setup(e){let t=i(null),n=i(!1),r=null;function a(){let e=t.value;e&&(n.value=e.scrollLeft+e.clientWidth<e.scrollWidth-1)}return v(()=>{if(a(),typeof ResizeObserver>`u`||!t.value)return;r=new ResizeObserver(a),r.observe(t.value);let e=t.value.querySelector(`table`);e&&r.observe(e)}),C(()=>r?.disconnect()),(r,i)=>(b(),S(`div`,{ref_key:`regionRef`,ref:t,class:E([`doc-table-scroll`,{"doc-table-scroll--more":n.value}]),role:`region`,tabindex:`0`,"aria-label":e.label,onScrollPassive:a},[s(`div`,{innerHTML:e.html},null,8,qe)],42,Ke))}}),[[`__scopeId`,`data-v-455673d8`]]),Ye=[`innerHTML`],Xe=[`innerHTML`],Ze=k(t({__name:`DocsArticle`,props:{blocks:{}},setup(e){let t=D();function n(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;let n=(e.target?.closest(`a[data-doc-link]`))?.getAttribute(`href`);n&&(e.preventDefault(),t.push(n))}return(t,r)=>(b(),S(`article`,{class:`doc-article`,onClick:n},[(b(!0),S(o,null,y(e.blocks,(e,t)=>(b(),S(o,{key:t},[e.kind===`html`?(b(),S(`div`,{key:0,class:`doc-prose`,innerHTML:e.html},null,8,Ye)):e.kind===`heading`?(b(),a(Ge,{key:1,id:e.id,level:e.level,html:e.html,text:e.text},null,8,[`id`,`level`,`html`,`text`])):e.kind===`code`?(b(),a(Oe,{key:2,code:e.code,language:e.language},null,8,[`code`,`language`])):e.kind===`table`?(b(),a(Je,{key:3,html:e.html,label:e.label},null,8,[`html`,`label`])):e.kind===`callout`?(b(),a(xe,{key:4,variant:e.variant},{default:T(()=>[s(`div`,{innerHTML:e.html},null,8,Xe)]),_:2},1032,[`variant`])):(b(),a(Ve,{key:5,source:e.source,caption:e.caption,"text-html":e.textHtml},null,8,[`source`,`caption`,`text-html`]))],64))),128))]))}}),[[`__scopeId`,`data-v-f334f125`]]),Qe={class:`doc-breadcrumb`,"aria-label":`Breadcrumb`},$e={key:1,"aria-current":`page`},et=k(t({__name:`DocsBreadcrumb`,props:{trail:{}},setup(e){return(t,n)=>{let r=w(`RouterLink`);return b(),S(`nav`,Qe,[s(`ol`,null,[(b(!0),S(o,null,y(e.trail,(t,n)=>(b(),S(`li`,{key:t.label},[t.to&&n<e.trail.length-1?(b(),a(r,{key:0,to:t.to,"aria-current":void 0},{default:T(()=>[h(f(t.label),1)]),_:2},1032,[`to`])):(b(),S(`span`,$e,f(t.label),1))]))),128))])])}}}),[[`__scopeId`,`data-v-67d8b810`]]);function tt(){let e=D();function t(){let e=de.opener;if(e?.isConnected&&e.getClientRects().length>0){e.focus();return}document.getElementById(`main`)?.focus()}let n=!1;function r(){if(n)return;n=!0;let r=de.path??`/`,i=e.afterEach(()=>{i(),n=!1,setTimeout(t,0)});window.history.state?.back===r?e.back():e.replace(r)}return{closeDocs:r}}var nt=k(t({__name:`DocsCloseButton`,setup(e){let{closeDocs:t}=tt();return(e,n)=>(b(),a(O,{class:`doc-close`,"accessible-name":`Close docs`,tooltip:`CLOSE`,"tooltip-side":`left`,onClick:u(t)},{default:T(()=>[...n[0]||=[s(`svg`,{width:`18`,height:`18`,viewBox:`0 0 18 18`,fill:`none`,"aria-hidden":`true`},[s(`line`,{x1:`3`,y1:`3`,x2:`15`,y2:`15`,stroke:`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`}),s(`line`,{x1:`15`,y1:`3`,x2:`3`,y2:`15`,stroke:`currentColor`,"stroke-width":`1.6`,"stroke-linecap":`round`})],-1)]]),_:1},8,[`onClick`]))}}),[[`__scopeId`,`data-v-f20d9633`]]),rt=[`aria-expanded`,`aria-controls`],it=[`id`],at=k(t({__name:`DocsDisclosure`,props:x({label:{},collapseBelow:{}},{open:{type:Boolean,default:!1},openModifiers:{}}),emits:[`update:open`],setup(e){let t=d(e,`open`),r=ee(),a=i(null);function o(e){let n=a.value;!t.value||!n||getComputedStyle(n).display===`none`||(e.stopPropagation(),t.value=!1,n.focus())}return(i,c)=>(b(),S(`div`,{class:E([`doc-disclosure`,[`doc-disclosure--${e.collapseBelow}`,{"doc-disclosure--open":t.value}]]),onKeydown:n(o,[`esc`])},[s(`button`,{ref_key:`buttonRef`,ref:a,type:`button`,class:`doc-disclosure__button`,"aria-expanded":t.value,"aria-controls":u(r),onClick:c[0]||=e=>t.value=!t.value},[s(`span`,null,f(e.label),1),l(ae,{open:t.value},null,8,[`open`])],8,rt),s(`div`,{id:u(r),class:`doc-disclosure__region`},[g(i.$slots,`default`,{},void 0,!0)],8,it)],34))}}),[[`__scopeId`,`data-v-4acd747a`]]),ot={class:`doc-group-icon`,width:`19`,height:`19`,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,"stroke-width":`1.8`,"stroke-linecap":`round`,"stroke-linejoin":`round`,"aria-hidden":`true`},st={key:3,d:`M14.5 6.5a3.8 3.8 0 0 0 4.6 4.8l-8.6 8.6a2.1 2.1 0 0 1-3-3l8.6-8.6a3.8 3.8 0 0 0 4.8-4.6l-2.6 2.6-2.2-.4-.4-2.2z`},ct=t({__name:`DocsGroupIcon`,props:{groupKey:{}},setup(e){return(t,n)=>(b(),S(`svg`,ot,[e.groupKey===`get-started`?(b(),S(o,{key:0},[n[0]||=s(`line`,{x1:`6`,y1:`3`,x2:`6`,y2:`21`},null,-1),n[1]||=s(`path`,{d:`M6 4.5h11.5L15 9l2.5 4.5H6`},null,-1)],64)):e.groupKey===`things-you-can-do`?(b(),S(o,{key:1},[n[2]||=m(`<path d="M3.5 6.5l1.6 1.6 3-3.2"></path><line x1="12" y1="6.5" x2="20.5" y2="6.5"></line><rect x="3.5" y="10" width="4.6" height="4.6"></rect><line x1="12" y1="12.3" x2="20.5" y2="12.3"></line><rect x="3.5" y="16" width="4.6" height="4.6"></rect><line x1="12" y1="18.3" x2="18" y2="18.3"></line>`,6)],64)):e.groupKey===`use-sentinel`?(b(),S(o,{key:2},[n[3]||=s(`path`,{d:`M5 4l12 6.4-5.2 1.7-1.9 5.4z`},null,-1),n[4]||=s(`path`,{d:`M15.5 15.5l4 4`},null,-1),n[5]||=s(`path`,{d:`M18.5 12.5l2 .6`},null,-1)],64)):e.groupKey===`set-up-and-run`?(b(),S(`path`,st)):e.groupKey===`how-it-works`?(b(),S(o,{key:4},[n[6]||=m(`<circle cx="5.5" cy="12" r="2.5"></circle><circle cx="18.5" cy="5.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle><line x1="7.8" y1="10.9" x2="16.2" y2="6.6"></line><line x1="7.8" y1="13.1" x2="16.2" y2="17.4"></line>`,5)],64)):e.groupKey===`develop`?(b(),S(o,{key:5},[n[7]||=s(`polyline`,{points:`8 7 3 12 8 17`},null,-1),n[8]||=s(`polyline`,{points:`16 7 21 12 16 17`},null,-1),n[9]||=s(`line`,{x1:`13.8`,y1:`5`,x2:`10.2`,y2:`19`},null,-1)],64)):(b(),S(o,{key:6},[n[10]||=s(`path`,{d:`M5 19.5V5A2 2 0 0 1 7 3h12v15H7a2 2 0 0 0-2 1.5 2 2 0 0 0 2 1.5h12`},null,-1),n[11]||=s(`path`,{d:`M14 3v7l-2-1.5L10 10V3`},null,-1)],64))]))}}),lt={class:`doc-rail theme-dark`,"aria-label":`Documentation sections`},ut=k(t({__name:`DocsGroupRail`,props:{groups:{},activeGroupKey:{}},setup(e){return(t,n)=>{let r=w(`RouterLink`);return b(),S(`nav`,lt,[s(`ul`,null,[(b(!0),S(o,null,y(e.groups,t=>(b(),S(`li`,{key:t.key},[l(r,{to:t.pages[0]?.url??`/doc/`,custom:``},{default:T(({href:n,navigate:r})=>[l(re,{class:`doc-rail__item`,href:n,"accessible-name":t.title,tooltip:t.title,active:t.key===e.activeGroupKey,current:t.key===e.activeGroupKey,onClick:r},{default:T(()=>[l(ct,{"group-key":t.key},null,8,[`group-key`])]),_:2},1032,[`href`,`accessible-name`,`tooltip`,`active`,`current`,`onClick`])]),_:2},1032,[`to`])]))),128))])])}}}),[[`__scopeId`,`data-v-cd986e17`]]),dt=[`id`],ft=k(t({__name:`DocsHeading`,props:{id:{}},setup(e){return(t,n)=>(b(),S(`h1`,{id:e.id||void 0,class:`doc-heading`,tabindex:`-1`},[n[0]||=s(`span`,{class:`doc-heading__dot`,"aria-hidden":`true`},null,-1),s(`span`,null,[g(t.$slots,`default`,{},void 0,!0)])],8,dt))}}),[[`__scopeId`,`data-v-a1596b33`]]),pt={id:`docs-live-status`,class:`sr-only`,role:`status`,"aria-live":`polite`,"data-testid":`docs-live-status`},mt=t({__name:`DocsLiveStatus`,setup(e){let t=me();return(e,n)=>(b(),S(`div`,pt,f(u(t).announcement),1))}}),ht=150,gt=t({__name:`DocsSearchField`,props:{modelValue:{},shortcut:{type:Boolean,default:!0},landmark:{type:Boolean,default:!0}},emits:[`update:modelValue`,`focus-results`],setup(e,{expose:t,emit:n}){let o=e,s=n,c=i(o.modelValue),l=i(null),u;r(()=>o.modelValue,e=>{e!==c.value&&(c.value=e)});function d(e=!1){clearTimeout(u),(e||c.value!==o.modelValue)&&s(`update:modelValue`,c.value)}r(c,()=>{clearTimeout(u),u=setTimeout(()=>d(),ht)});function f(e){e.key===`Escape`?(e.stopPropagation(),c.value!==``&&(e.preventDefault(),c.value=``,d())):e.key===`Enter`?d(!0):e.key===`ArrowDown`&&(e.preventDefault(),d(),s(`focus-results`))}function p(e){return e instanceof HTMLElement&&e.closest(`input, textarea, select, [contenteditable]`)!==null}return ie(`keydown`,e=>{!o.shortcut||e.key!==`/`||e.ctrlKey||e.metaKey||e.altKey||p(e.target)||(e.preventDefault(),l.value?.focus())}),C(()=>clearTimeout(u)),t({focus:()=>l.value?.focus(),select:()=>l.value?.select()}),(t,n)=>(b(),a(se,{ref_key:`fieldRef`,ref:l,modelValue:c.value,"onUpdate:modelValue":n[0]||=e=>c.value=e,class:`doc-search-field`,landmark:e.landmark,label:`Search the docs`,placeholder:`SEARCH DOCS`,"clear-label":`Clear search`,onKeydown:f,onClear:n[1]||=e=>d()},null,8,[`modelValue`,`landmark`]))}}),_t={class:`doc-not-found`},vt=k(t({__name:`DocsNotFound`,props:{requestedPath:{}},emits:[`search`],setup(e,{emit:t}){let n=e,r=t,a=i(null),o=n.requestedPath.split(`/`).filter(Boolean).pop()??``;return v(()=>{a.value?.focus(),a.value?.select()}),(t,n)=>{let i=w(`RouterLink`);return b(),S(`div`,_t,[s(`p`,null,[n[1]||=h(` There's no page at `,-1),s(`code`,null,`/doc/`+f(e.requestedPath),1),n[2]||=h(`. It may have moved. `,-1)]),s(`p`,null,[l(i,{to:`/doc/`},{default:T(()=>[...n[3]||=[h(`Welcome to Sentinel`,-1)]]),_:1})]),n[4]||=s(`p`,{class:`doc-not-found__prompt`},`Or search for it:`,-1),l(gt,{ref_key:`searchRef`,ref:a,class:`doc-not-found__search`,"model-value":u(o),shortcut:!1,landmark:!1,"onUpdate:modelValue":n[0]||=e=>r(`search`,e)},null,8,[`model-value`])])}}}),[[`__scopeId`,`data-v-2cce02a9`]]);function yt(e){let t=i(``),n=new Set,a=null;function o(){let r=e.value.find(e=>n.has(e));r!==void 0&&(t.value=r)}function s(){if(a?.disconnect(),n.clear(),t.value=``,!(typeof IntersectionObserver>`u`)){a=new IntersectionObserver(e=>{for(let t of e)t.isIntersecting?n.add(t.target.id):n.delete(t.target.id);o()},{rootMargin:`0px 0px -70% 0px`});for(let t of e.value){let e=document.getElementById(t);e&&a.observe(e)}}}return r(e,s,{immediate:!0,flush:`post`}),C(()=>a?.disconnect()),t}var bt={key:0,class:`doc-toc`,"aria-label":`On this page`},xt={class:`doc-toc__list`},St=k(t({__name:`DocsOnThisPage`,props:{entries:{},pageUrl:{}},setup(e){let t=e,n=i(!1),r=yt(p(()=>t.entries.map(e=>e.id)));return(t,i)=>{let a=w(`RouterLink`);return e.entries.length>0?(b(),S(`nav`,bt,[l(at,{open:n.value,"onUpdate:open":i[0]||=e=>n.value=e,label:`On this page`,"collapse-below":`wide`},{default:T(()=>[i[1]||=s(`p`,{class:`doc-toc__label`,"aria-hidden":`true`},`ON THIS PAGE`,-1),s(`ol`,xt,[(b(!0),S(o,null,y(e.entries,t=>(b(),S(`li`,{key:t.id,class:E(`doc-toc__item--h${t.level}`)},[l(a,{class:E([`doc-toc__link`,{"doc-toc__link--current":t.id===u(r)}]),to:{path:e.pageUrl,hash:`#${t.id}`},"aria-current":t.id===u(r)?`location`:void 0},{default:T(()=>[h(f(t.text),1)]),_:2},1032,[`class`,`to`,`aria-current`])],2))),128))])]),_:1},8,[`open`])])):c(``,!0)}}}),[[`__scopeId`,`data-v-f6e17277`]]),Ct=`https://github.com/barrygee/Sentinel`,wt=`${Ct}/blob/main/CHANGELOG.md`,Tt=/^[a-z][a-z0-9+.-]*:/i;function Et(e,t){let n=[...t.startsWith(`/`)?[]:e.split(`/`).slice(0,-1)];for(let e of t.split(`/`))e===``||e===`.`||(e===`..`?n.pop():n.push(e));return n.join(`/`)}function Dt(e,t,n){if(Tt.test(e)||e.startsWith(`//`))return{kind:`external`,href:e,opensNewTab:!e.toLowerCase().startsWith(`mailto:`)};if(e.startsWith(`#`))return{kind:`hash`,hash:e};let r=e.indexOf(`#`),i=r===-1?e:e.slice(0,r),a=r===-1?``:e.slice(r),o=Et(t,decodeURI(i)),s=n.pageByFile.get(o);return s?{kind:`page`,page:s,hash:a}:{kind:`external`,href:`${Ct}/${i.endsWith(`/`)?`tree`:`blob`}/main/${o}${a}`,opensNewTab:!0}}function Ot(e,t,n){if(Tt.test(e)||e.startsWith(`//`)||e.startsWith(`data:`))return e;let r=Et(t,decodeURI(e));return n[r]??`https://raw.githubusercontent.com/barrygee/Sentinel/main/${r}`}var kt=[`aria-label`],At={class:`doc-page-list__label`},jt={class:`doc-page-list__pages`},Mt={key:0},Nt=[`href`,`aria-current`,`onClick`],Pt={key:1,class:`doc-page-list__subgroup`},Ft={class:`doc-page-list__sublabel`},It=[`aria-label`],Lt=[`href`,`aria-current`,`onClick`],Rt={class:`doc-page-list__external`},zt=[`href`],Bt=k(t({__name:`DocsPageList`,props:{group:{},currentPath:{}},setup(e){function t(e,t){return e.path===t}return(n,r)=>{let i=w(`RouterLink`);return b(),S(o,null,[e.group?(b(),S(`nav`,{key:0,class:`doc-page-list`,"aria-label":`Pages in ${e.group.title}`},[s(`p`,At,f(e.group.title),1),s(`ol`,jt,[(b(!0),S(o,null,y(e.group.entries,n=>(b(),S(o,{key:n.kind===`page`?n.page.path:n.subgroup.title},[n.kind===`page`?(b(),S(`li`,Mt,[l(i,{to:n.page.url,custom:``},{default:T(({href:r,navigate:i})=>[s(`a`,{class:E([`doc-page-list__link`,{"doc-page-list__link--current":t(n.page,e.currentPath)}]),href:r,"aria-current":t(n.page,e.currentPath)?`page`:void 0,onClick:i},f(n.page.title),11,Nt)]),_:2},1032,[`to`])])):(b(),S(`li`,Pt,[s(`p`,Ft,f(n.subgroup.title),1),s(`ol`,{class:`doc-page-list__pages doc-page-list__pages--nested`,"aria-label":n.subgroup.title},[(b(!0),S(o,null,y(n.subgroup.pages,n=>(b(),S(`li`,{key:n.path},[l(i,{to:n.url,custom:``},{default:T(({href:r,navigate:i})=>[s(`a`,{class:E([`doc-page-list__link`,{"doc-page-list__link--current":t(n,e.currentPath)}]),href:r,"aria-current":t(n,e.currentPath)?`page`:void 0,onClick:i},f(n.title),11,Lt)]),_:2},1032,[`to`])]))),128))],8,It)]))],64))),128))])],8,kt)):c(``,!0),s(`p`,Rt,[s(`a`,{href:u(wt),target:`_blank`,rel:`noopener noreferrer`},[...r[0]||=[h(`What's new (online only) `,-1),s(`span`,{"aria-hidden":`true`},`↗`,-1),s(`span`,{class:`sr-only`},`(opens in a new tab)`,-1)]],8,zt)])],64)}}}),[[`__scopeId`,`data-v-267e9f40`]]),Vt={key:0,class:`doc-prev-next`,"aria-label":`Previous and next page`},Ht={class:`doc-prev-next__title`},Ut={key:1},Wt={class:`doc-prev-next__title`},Gt=k(t({__name:`DocsPrevNext`,props:{previous:{},next:{}},setup(e){return(t,n)=>{let r=w(`RouterLink`);return e.previous||e.next?(b(),S(`nav`,Vt,[e.previous?(b(),a(r,{key:0,class:`doc-prev-next__cell`,to:e.previous.url,rel:`prev`},{default:T(()=>[n[0]||=s(`span`,{class:`doc-prev-next__direction`},`‹ PREVIOUS`,-1),s(`span`,Ht,f(e.previous.title),1)]),_:1},8,[`to`])):(b(),S(`span`,Ut)),e.next?(b(),a(r,{key:2,class:`doc-prev-next__cell doc-prev-next__cell--next`,to:e.next.url,rel:`next`},{default:T(()=>[n[1]||=s(`span`,{class:`doc-prev-next__direction`},`NEXT ›`,-1),s(`span`,Wt,f(e.next.title),1)]),_:1},8,[`to`])):c(``,!0)])):c(``,!0)}}}),[[`__scopeId`,`data-v-c0050f7f`]]);function Kt(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}function qt(e){let t=[...new Set(e.map(e=>e.trim()).filter(e=>e!==``))];return t.length===0?null:(t.sort((e,t)=>t.length-e.length),RegExp(`(?<![\\p{L}\\p{N}_-])(${t.map(Kt).join(`|`)})`,`giu`))}function Jt(e,t){let n=qt(t);return n===null||e===``?[{text:e,match:!1}]:e.split(n).map((e,t)=>({text:e,match:t%2==1})).filter(e=>e.text!==``)}function Yt(e,t,n=90){let r=qt(t)?.exec(e)?.index??-1,i=Math.max(0,r===-1?0:r-n),a=Math.min(e.length,i+n*2),o=e.slice(i,a);return i>0&&(o=o.replace(/^\S*\s/,``)),a<e.length&&(o=o.replace(/\s\S*$/,``)),`${i>0?`…`:``}${o}${a<e.length?`…`:``}`}var Xt={class:`doc-search-result`},Zt={class:`doc-search-result__line`},Qt={class:`doc-search-result__title`},$t={key:0},en={class:`doc-search-result__heading`},tn={key:0},nn={key:0,class:`doc-search-result__snippet`},rn={key:0},an=k(t({__name:`DocsSearchResult`,props:{hit:{},pageUrl:{}},setup(e){let t=e,n=p(()=>({path:t.pageUrl,hash:t.hit.section.headingId?`#${t.hit.section.headingId}`:``})),r=p(()=>Jt(t.hit.section.pageTitle,t.hit.matchedTerms)),i=p(()=>Jt(t.hit.section.heading,t.hit.matchedTerms)),a=p(()=>Jt(t.hit.snippet,t.hit.matchedTerms)),u=p(()=>t.hit.section.headingId!==``);return(t,d)=>{let p=w(`RouterLink`);return b(),S(`li`,Xt,[l(p,{class:`doc-search-result__link`,to:n.value},{default:T(()=>[s(`span`,Zt,[s(`span`,Qt,[(b(!0),S(o,null,y(r.value,(e,t)=>(b(),S(o,{key:t},[e.match?(b(),S(`mark`,$t,f(e.text),1)):(b(),S(o,{key:1},[h(f(e.text),1)],64))],64))),128))]),u.value?(b(),S(o,{key:0},[d[0]||=s(`span`,{class:`doc-search-result__separator`,"aria-hidden":`true`},` › `,-1),d[1]||=s(`span`,{class:`sr-only`},` section `,-1),s(`span`,en,[(b(!0),S(o,null,y(i.value,(e,t)=>(b(),S(o,{key:t},[e.match?(b(),S(`mark`,tn,f(e.text),1)):(b(),S(o,{key:1},[h(f(e.text),1)],64))],64))),128))])],64)):c(``,!0)]),e.hit.snippet?(b(),S(`span`,nn,[(b(!0),S(o,null,y(a.value,(e,t)=>(b(),S(o,{key:t},[e.match?(b(),S(`mark`,rn,f(e.text),1)):(b(),S(o,{key:1},[h(f(e.text),1)],64))],64))),128))])):c(``,!0)]),_:1},8,[`to`])])}}}),[[`__scopeId`,`data-v-ed028c51`]]),on={class:`doc-search-results__empty`},sn={class:`doc-search-results__summary`},cn={class:`doc-search-results__group-title`},ln={class:`doc-search-results__list`},un=k(t({__name:`DocsSearchResults`,props:{query:{},outcome:{},library:{}},emits:[`focus-field`],setup(e,{expose:t,emit:n}){let r=e,c=n,l=i(null),u=p(()=>{let e=r.outcome?.hits??[];return r.library.groups.map(t=>({key:t.key,title:t.title,hits:e.filter(e=>e.section.groupKey===t.key)})).filter(e=>e.hits.length>0)}),d=p(()=>r.outcome?.hits.length??0),m=p(()=>(r.outcome?.expansions??[]).map(e=>e.alsoSearching[0]??``)),h=p(()=>{let e=d.value===1?`result`:`results`,t=r.outcome?.totalHits??0,n=t>d.value?`Showing ${d.value} of ${t}`:`${d.value}`,i=m.value.length>0?` · also searching ${m.value.join(`, `)}`:``;return`${n} ${e} for “${r.query.trim()}”${i}`});function g(e){return r.library.pageByPath.get(e.section.pagePath)?.url??`/doc/`}function _(){return Array.from(l.value?.querySelectorAll(`.doc-search-result a`)??[])}function v(e){if(e.key!==`ArrowDown`&&e.key!==`ArrowUp`)return;let t=_(),n=t.findIndex(e=>e===document.activeElement);n!==-1&&(e.preventDefault(),e.key===`ArrowDown`?t[Math.min(n+1,t.length-1)]?.focus():n===0?c(`focus-field`):t[n-1]?.focus())}return t({focusFirst:()=>_()[0]?.focus()}),(t,n)=>(b(),S(`div`,{ref_key:`rootRef`,ref:l,class:`doc-search-results`,onKeydown:v},[d.value===0?(b(),S(o,{key:0},[s(`p`,on,` NO RESULTS FOR “`+f(e.query.trim().toUpperCase())+`” `,1),n[0]||=s(`p`,{class:`doc-search-results__hint`},`Try other words, or browse the sections on the left.`,-1)],64)):(b(),S(o,{key:1},[s(`p`,sn,f(h.value),1),(b(!0),S(o,null,y(u.value,e=>(b(),S(`section`,{key:e.key,class:`doc-search-results__group`},[s(`h2`,cn,f(e.title),1),s(`ol`,ln,[(b(!0),S(o,null,y(e.hits,e=>(b(),a(an,{key:e.section.id,hit:e,"page-url":g(e)},null,8,[`hit`,`page-url`]))),128))])]))),128))],64))],544))}}),[[`__scopeId`,`data-v-de8f53b0`]]);function dn(e,t,n,i){r([e,t],async([,t],r)=>{let[a]=r??[];if(await _(),n.value)return;if(a!==e.value)for(let e of i.scrollRegions.value)e&&(e.scrollTop=0);let o=document.activeElement;if(o instanceof HTMLInputElement||o instanceof HTMLTextAreaElement)return;let s=t===``?null:i.findAnchorTarget(t);if(s){s.scrollIntoView({block:`start`}),s.focus({preventScroll:!0});return}i.findPageHeading()?.focus({preventScroll:!0})},{immediate:!0,flush:`post`})}var fn=[`get-started`,`things-you-can-do`,`use-sentinel`,`set-up-and-run`,`how-it-works`,`develop`,`reference`],pn=`index`,A=class extends Error{constructor(e){super(`docs/nav.json: ${e}`),this.name=`DocsNavigationError`}};function mn(e){return e===`index`?`/doc/`:`/doc/${e}`}function hn(e){let t=e.replace(/^\/+|\/+$/g,``);return t===``?pn:t}function gn(e){return e.replace(/^(\.\.\/)+/,``)}function j(e){return typeof e==`object`&&!!e&&!Array.isArray(e)}function _n(e,t,n){let r=e[t];if(typeof r!=`string`||r.trim()===``)throw new A(`${n} needs a non-empty string "${t}"`);return r}function vn(e){return fn.includes(e)}function yn(e,t){if(!j(e)||!Array.isArray(e.groups))throw new A(`expected an object with a "groups" array`);let n=new Map,r=new Map,i=[],a=new Set;function o(e,i,a,o){if(!j(e))throw new A(`${i} must be an object`);let s=_n(e,`path`,i),c=_n(e,`title`,i),l=typeof e.file==`string`?e.file:`docs/${s}.md`;if(n.has(s))throw new A(`${i}: duplicate page path "${s}"`);let u=t[l];if(u===void 0)throw new A(`${i}: "${s}" points at ${l}, which was not bundled (is the file missing, or under docs/plans?)`);let d={path:s,url:mn(s),title:c,file:l,markdown:u,groupKey:a.key,groupTitle:a.title,...o===void 0?{}:{subgroupTitle:o}};return n.set(s,d),r.set(l,d),d}e.groups.forEach((e,t)=>{let n=`groups[${t}]`;if(!j(e))throw new A(`${n} must be an object`);let r=_n(e,`key`,n);if(!vn(r))throw new A(`${n}: unknown group key "${r}"`);if(a.has(r))throw new A(`${n}: duplicate group "${r}"`);a.add(r);let s=_n(e,`title`,n);if(!Array.isArray(e.pages))throw new A(`${n} needs a "pages" array`);let c=[],l=[];e.pages.forEach((e,t)=>{let i=`${n}.pages[${t}]`;if(j(e)&&Array.isArray(e.pages)){let t=_n(e,`title`,i),n=e.pages.map((e,n)=>o(e,`${i}.pages[${n}]`,{key:r,title:s},t));c.push({kind:`subgroup`,subgroup:{title:t,pages:n}}),l.push(...n)}else{let t=o(e,i,{key:r,title:s},void 0);c.push({kind:`page`,page:t}),l.push(t)}}),l.length>0&&i.push({key:r,title:s,entries:c,pages:l})});let s={};if(e.synonyms!==void 0){if(!j(e.synonyms))throw new A(`"synonyms" must be an object`);for(let[t,n]of Object.entries(e.synonyms)){if(!Array.isArray(n)||n.some(e=>typeof e!=`string`))throw new A(`synonyms["${t}"] must be an array of strings`);s[t.toLowerCase()]=n}}return{groups:i,pages:i.flatMap(e=>e.pages),pageByPath:n,pageByFile:r,synonyms:s}}function bn(e,t){let n=e.pages.findIndex(e=>e.path===t);return n===-1?{previous:null,next:null}:{previous:e.pages[n-1]??null,next:e.pages[n+1]??null}}var xn='# Contributing to Sentinel\n\nThanks for working on Sentinel. This page covers how changes get in: branches, commit messages and pull requests. Everything else a developer needs is in the docs:\n\n- [Set up for development](docs/development/setup.md): tools, first-time set-up and the dev loop.\n- [Find your way around the code](docs/development/code-map.md)\n- [Run tests and quality checks](docs/development/testing.md): every check CI runs, and the 100% coverage rule.\n- [How to…](docs/development/how-to.md) add a setting, a section, a decoder or a map control, and ship a frontend change.\n- [How it works](docs/architecture/overview.md)\n\nNever commit a `.env` file or any secret.\n\n## Branches\n\n- **Never commit to `main`.** Branch off the latest `main` for every change, however small.\n- Name the branch after the kind of change: `type/short-kebab-description`, such as `feat/sdr-scanner`, `fix/adsb-filter-flash` or `docs/contributing`.\n- One logical change per branch.\n\n## Commits\n\nSentinel uses [Conventional Commits](https://www.conventionalcommits.org). The changelog is written from them automatically, so a vague message becomes a vague changelog line.\n\n```text\ntype(scope): short imperative subject\n\noptional body explaining why\n```\n\n| Type | Changelog heading | Use for |\n|---|---|---|\n| `feat` | Features | Something new a user can do |\n| `fix` | Bug Fixes | A bug fix |\n| `perf` | Performance | Faster or lighter, same behaviour |\n| `refactor` | Refactoring | Restructuring with no change in behaviour |\n| `docs` | Documentation | Docs only |\n| `test` | Tests | Adding or fixing tests |\n| `build` | Build System | Build, tooling and dependency mechanics, including rebuilding `frontend/spa-dist/` |\n| `ci` | Continuous Integration | CI workflows |\n| `style` | Styling | Formatting only |\n| `chore` | Chores | Other maintenance (`chore(deps)` goes under Dependencies) |\n| `revert` | Reverts | Undoing an earlier commit |\n\nThe mapping lives in [`cliff.toml`](cliff.toml).\n\n- Keep each commit to **one logical change**. Don\'t fold an unrelated refactor into a feature.\n- Write the subject in the **imperative**: "add", not "added" or "adds".\n- Mark a breaking change with `!` after the type or scope (`feat!:`), or a `BREAKING CHANGE:` footer.\n- A frontend change and its rebuilt `frontend/spa-dist/` go in separate commits: the change first, then `build(spa): …`.\n\n## Pull requests\n\n1. **Keep it focused**: one change per pull request. Small ones are reviewed faster and are easier to revert.\n2. **Run the checks** in [Run tests and quality checks](docs/development/testing.md) first, including the browser tests for any UI change.\n3. **Read your own diff** as a reviewer would before you ask anyone else to.\n4. **Open it against `main`**, with a description that says what changed, why, how you tested it, and any breaking change. Add screenshots for UI changes.\n5. **Every CI check must pass**, and new frontend code must be at 100% coverage.\n\nThe **changelog updates itself.** After each merge to `main`, a GitHub Action (`.github/workflows/changelog.yml`, using git-cliff) rewrites `CHANGELOG.md` from the commits and commits it to `main`. It never touches your branch. Don\'t edit `CHANGELOG.md` by hand.\n',Sn=`# 0001. Retrofit Sentinel to the webapp standards

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
`,Cn="# 0002. Dedupe the Vue SPA onto base components (B-series)\n\nDate: 2026-07-12\nStatus: accepted\n\n## Context\n\nTwo exhaustive inventories of `frontend/vue/src` (2026-07-12, following the\nSdrPanel decomposition series P0–P7, PRs #190–#197) found substantial UI\nduplication that the existing 13-primitive `components/base/` layer does not\nyet absorb:\n\n- **Teleported dropdown pattern:** five SDR pickers (`SdrStepPicker`,\n  `SdrSampleRatePicker`, `SdrDeviceSelector`, `SdrSettingsAccordion`,\n  `SdrTrunkSection`) carried near-verbatim copies of the same menu state,\n  positioning, settle-window scroll dismissal and listener registrations\n  (~250 script lines + ~90 template lines). The settings panel re-implements\n  the same visual a second way (`tle-dropdown`, 3 files) and `AirReplayPanel`\n  a third way with hand-rolled dismissal.\n- **Accordion headers:** 5 byte-identical copies of the SDR header-row +\n  chevron toggle, plus 2 near-copies in `SdrFrequencyManagerTab`.\n- **Pills/chips/segmented toggles:** ~25 instances (`sdr-mode-pill` ×10+ incl.\n  the tune/stop/rec/decode transport buttons, scan group chips, pass category\n  chips, `settings-source-override-btn` shared across two settings files,\n  `SdrDeviceForm` ENABLED/DISABLED, replay speed pills).\n- **Icon row-actions:** ~15 tooltip'd action buttons across\n  `AirFilter`/`SpaceFilter`/`SpacePasses`/`SdrRecordingsSection`/\n  `SdrDecodeDock` using the exact `data-tooltip` mechanism `BaseIconButton`\n  centralises, but in a non-rail shape; plus bare-glyph row actions and 4\n  identical \"clear search ✕\" buttons.\n- **Underadopted primitives:** `BaseListItem` has zero importers despite 6+\n  hand-rolled row sites shaped like it; ~7 files re-implement the same\n  empty-state/hint label.\n- **Other:** 3 unrelated custom-checkbox families; 4 near-identical slider\n  rows; ~90 duplicated lines (formatters + RADIO grid template) between\n  `SpaceFilter` and `SpacePasses`; `SdrPanel.css` (3,889 lines, global)\n  styling 10 components that own no styles.\n\n## Decision\n\nEliminate the duplication in a phased **B-series** — one small PR per phase,\nshared logic before primitives, primitives before adoptions. Variants compose\na base (slots + props + CSS custom-property hooks); they never copy it.\n\n| Phase | Deliverable | Removes |\n|---|---|---|\n| B0 | `useTeleportedMenu()` composable adopted by the 5 SDR pickers | ~250 verbatim script lines; zero visual change |\n| B1 | `BaseSelectMenu` primitive on B0 (trigger/option slots, opt-in keyboard nav) | the 5 pickers' duplicated templates |\n| B2 | `BaseAccordionSection` (title, `v-model:expanded`, header-extra + body slots) | 5 exact + 2 near-exact accordion headers |\n| B3 | `BasePillToggle` (no group wrapper: today it would be a classless pass-through div; it belongs with a deliberate radiogroup-ARIA pass, not a byte-identical dedupe). *The deferred pass shipped post-series as the SDR-controls a11y PR: single-select segmented groups (MODE pills ×5 forms, device ENABLED/DISABLED, source override, hover preview, playback speed) put `role=\"radiogroup\"` on their existing wrappers with `role=\"radio\"`/`aria-checked` pills driven by the `useRadioGroupKeyboard` composable (roving tabindex + arrow keys); multi-select chip groups (scan-group filter, edit-form GROUPS, pass categories) and the REC toggle got `aria-pressed`; momentary TUNE/STOP stay bare. No group wrapper component was needed — the family wrappers already existed.* | ~24 pill/chip/segmented buttons (the 25th \"chip\" is a decorative span in `SdrWaterfall` — styling reuse, not a toggle) |\n| B4 | `BaseIconAction`, the non-rail sibling of `BaseIconButton` (composes `BasePillToggle`; top/bottom/left tooltip anchoring + custom-prop pill restyling — none of these tooltips use the rail's left/right model) | 17 tooltip'd row actions, 10 bare glyphs, 4 clear-✕; 5 duplicated tooltip CSS blocks |\n| B5 | Adopt `BaseButton` ghost for the `sdr-panel-btn` CANCEL/SAVE/ADD family (ghost only — SAVE is a tint modifier of the same family, not the lime primary; ghost gained bg/hover-bg/radius/font-weight/letter-spacing hooks as the dark-theme mirror). `sdr-add-freq-btn` stays hand-rolled: its mixed-case accent look isn't a ghost | the family's chrome CSS (now hook mappings mirroring the original cascade rule-for-rule) across 12 button sites in 4 SDR files |\n| B6 | `BaseCheckbox` (checkmark slot) | 3 unrelated checkbox families |\n| B7 | `BaseSliderRow` (label + pre-formatted readout + raw-event range input). Waterfall's 3 rows stay: different structure (horizontal label, wrapped `v-model` slider, no readout) and CSS family — the hook did not fit | 4 SETTINGS slider rows |\n| B8 | DESCOPED on evidence (2026-07-15): the empty-state primitive already exists — `BaseList`'s `emptyText` default + `#empty` slot, adopted where it fits (TrackingPanel, recordings); the remaining \"empties\" are non-list one-offs a component can't absorb byte-identically (`settings-empty` light theme, `SdrDecodeDock`'s `<td colspan>`, `sdr-trunk-hint` paragraph, `sdr-panel-empty`'s JS-driven `display:none`), and `#msb-tracking-empty` (the one byte-identical duplicate of `.ba-list-empty`) is spec-pinned by id. `BaseListItem` retrofits fail the same test: every candidate row family owns layout+hover CSS that conflicts with (`.sdr-search-range-item:hover` = 0.06 vs the primitive's 0.04) or exactly duplicates the primitive's affordances — adoption would add a wrapper class and delete nothing. `BaseListItem` remains the primitive for NEW lists | — |\n| B9 | `SatRadioInfoSection` (class-prefix prop selects the caller's `sfr-acc`/`spp-acc` family) + shared `satRadioInfo.ts` utils (`formatHz`/`formatStatus`/`splitNotes`/`hasRadioInfo`, now directly unit-tested instead of v8-ignored). The scattered SDR `(hz/1e6).toFixed` calls were evaluated and left: they differ in precision and format (3/4 dp, kHz steps, unit-less) — a parameterised wrapper would add indirection without removing duplication | ~90 duplicated Space lines |\n| B10 | CSS co-location sweep, one family per PR (B10a…). Settled policy (2026-07-15): a family moves to its **sole renderer** — the feature component that puts the classes in the DOM (a base primitive owns a family only where its own template hardcodes the classes, e.g. `BaseSelectMenu`'s `sdr-device-dropdown/-menu` shell); moved blocks are **unscoped** `<style>` (scoped `[data-v]` selectors would raise specificity, and the classes often sit on base-component-rendered elements outside the adopter's scope). Cascade rule: `SdrPanel.css` is `SdrPanel.vue`'s *first* import, so component styles always land **after** it in module order — a family may move only when no equal-specificity rule remaining in another file targets the same elements (verified per PR in the built CSS; the once-feared per-picker menu modifiers `.sdr-step-menu`/`.sdr-trunk-menu` have no rules today, and all contextual overrides — `#sdr-mini-player …`, `.sdr-search-adhoc-col …`, `.sdr-ef-setting …`, `.sdr-settings-controls …` — are higher-specificity, hence order-immune). Shared stragglers (`.sdr-slider-header/-val`, rendered by both `BaseSliderRow` and the hand-rolled SAMPLE RATE header) go to `SdrSettingsAccordion`, the one component containing every renderer. Families that can't move without cascade risk stay, with the reason recorded here | B10a: the AGC checkbox family (`.sdr-agc-row`/`.sdr-checkbox-*`) → `SdrSettingsAccordion.vue`. B10b: the slider-row families — `.sdr-slider-header/-val` → `SdrSettingsAccordion.vue` (per the straggler rule), `.sdr-panel-slider` chrome → `BaseSliderRow.vue` (sole renderer; its `outline: none` is focus-safe because a11y.css restores `:focus-visible` with `!important`). B10c: the trunk family (`.sdr-trunk-*` + the `#sdr-trunk-section-body` context rules) → `SdrTrunkSection.vue`. B10d: the GROUPS tab families (`.sdr-group-pill*` live rules, `.sdr-frequency-manager-group-add-row`, `.sdr-panel-add-row`) → `SdrGroupsTab.vue`, moved as one ordered unit because the two add-row classes style the same element at equal specificity with conflicting padding; the pill edit/del glyph chrome stays grouped with its `.sdr-freq-row-edit` siblings in `SdrPanel.css`, and `.sdr-group-pill-dot`/`-default` stay as dead-CSS candidates (no renderer anywhere) for the verification pass. B10e: the recordings family (~580 lines — `.sdr-recording-*`, `.sdr-recordings-*`, `#sdr-recordings-*`) → `SdrRecordingsSection.vue`; stays behind: `@keyframes sdr-rec-pulse` (shared with the transport REC button; keyframes are global by name), the `:has()` pane-layout rules that only probe `.sdr-recordings-body`, and four dead-CSS candidates (`.sdr-rec-timer`, `.sdr-recordings-count`, the never-toggled `-hint-visible`/`-arrow-up` variants — the scroll hint is driven by inline `style.display`). B10f: the device-dropdown family → `BaseSelectMenu.vue` in ONE piece (trigger shell + teleported menu + item rules incl. `--selected`, preserving the internal `--active` → `--selected` order; the item classes are slot-rendered by the pickers but splitting the family would risk its internal cascade), and the connection-dot family (`.sdr-conn-dot`, `.sdr-dot-off/-on`) → `SdrDeviceSelector.vue`; stays behind: the contextual overrides (`#sdr-device-group-*`, `.sdr-search-adhoc-col`, `#sdr-mini-player` — higher specificity, order-immune) and three more dead-CSS candidates (`.sdr-dot-idle` — the dot binds a two-state ternary; `.sdr-device-menu--upward` — nothing adds the class; `.sdr-conn-label/-on/-off` — no renderer). B10g: the dead-CSS verification pass — every class and id selector in `SdrPanel.css` was checked against the full source corpus (`src/**` + specs + `e2e/**` + root `tests/`, including a sweep for dynamically-constructed class names, of which the codebase has none); **98 classes and 8 ids proved unrendered** — pre-Vue-migration leftovers (the whole `#sdr-mini-player` panel, `sdr-mgmt-*`, `sdr-modal-*`, the old `sdr-scanner-main/section-*` accordion, `sdr-tab-header/-title`, `sdr-search-row*` and the previously flagged candidates) — and their ~140 rules (~1,100 lines) deleted; a rule was removed only when *every* selector in it required a dead name, with three grouped selectors pruned member-wise. B10h: the same analysis over `SettingsPanel.css` — the owner map shows a healthy sheet (~100 of 165 classes belong to the `settings/*` sub-controls in clearly-labelled sections, the rest is panel chrome), so per-family co-location there is deliberately **left out of B10's scope**: the B-series-relevant families all stay by documented design (`tle-dropdown` = blur-dismiss by design per this ADR; `settings-source-override-btn` = B3's shared two-control family; `tle-cat-*` = B5's documented intentionally-distinct buttons), and relocating the rest is optional future work on the settled policy, not part of this series' goal. Dead CSS was deleted (27 rules: the removed theme switch, `settings-datasource-status*`, `settings-result-breadcrumb`, `#settings-btn.settings-btn-active`, `tle-info-toggle*`, `tle-section-heading`, `tle-uncat-select*`, `tle-dropdown-item--placeholder`, `sdr-devices-agc-*`) — with a dynamic-construction sweep first, which mattered: `tle-status-badge--*` and `settings-conn-override-val--*` are built via `:class=\"'…--' + var\"` and are live despite having no static occurrences |\n\nEvery phase keeps runtime behaviour byte-identical (same DOM classes, same\nevent/command cadence), holds the 100% coverage gate, ships jest-axe tests on\nnew components, keeps `e2e/sdr.spec.ts` green, and commits the rebuilt\n`frontend/spa-dist/` bundle.\n\n**Deliberately out of scope** (evidence, not guesswork): MapLibre IControl\nDOM-created buttons (centralised in `SentinelControlBase`; only\n`AdsbLiveControl`'s own toggle could optionally extend it — an imperative-layer\nchange); `AirSideMenu`'s 3D widget (tooltips open upward, excluded by\n`BaseIconButton`'s documented left/right model); `AirReplayPanel` calendar\ninternals (one-off widget); `sdr-device-btn` and `tle-cat-clear` (documented\nin `BaseButton` as intentionally distinct); the `AirFilter`/`SpaceFilter`\nalways-visible listboxes (an a11y structure, not dropdowns); one-off CTAs\n(`NoUrlOverlay`, `App.vue` nav overlay, `spp-action-btn`).\n\nThe `tle-dropdown` family's blur-dismiss model is deliberate; it folds into\n`BaseSelectMenu` only if the primitive grows a non-teleported mode, otherwise\nit stays.\n\n## Consequences\n\n- New base primitives own their styles (scoped/co-located), reversing the\n  P-series convention of parking extracted components' CSS in the global\n  `SdrPanel.css`; the global sheets shrink as phases land.\n- The plan is recorded here because the P-series plan doc was never committed\n  and its final phase's scope was lost.\n- Phase statuses are tracked in the PRs (search: \"base dedupe B\" /\n  `refactor/use-teleported-menu` onwards).\n- **The series is COMPLETE (2026-07-16, B0–B10 across PRs #198–#206 and\n  #207 onwards; B8 descoped on evidence).** B10 ran as seven sub-phase PRs\n  (B10a–B10g on `SdrPanel.css`, B10h on `SettingsPanel.css`): every\n  component-owned family was co-located per the settled policy in the B10\n  row, ~1,100 lines of verified-dead pre-Vue CSS were deleted, and\n  `SdrPanel.css` shrank from 3,889 lines to ~1,830 — what remains is\n  SdrPanel.vue's own styling plus the shared multi-renderer families\n  (`sdr-panel-btn/-input`, `sdr-field-label`, `sdr-radio-section`,\n  `sdr-freq-row-*`, `sdr-editfreq-*`) that have no sole owner by design.\n  `SettingsPanel.css` remains the settings surface's sectioned sheet\n  (B10h row); relocating its sub-control families is optional future work\n  on the same policy, not a gap in this series.\n\n## Amendment (2026-08-15) — `SdrTrunkSection` no longer exists\n\nTrunk tracking was removed in ADR-0004, taking `SdrTrunkSection.vue` and its\nCSS family with it. The record above is left as written — it describes the\ninventory that motivated the B-series at the time — but three of its references\nnow point at code that is gone:\n\n- **Context, teleported dropdown pattern:** `SdrTrunkSection` was one of the\n  five pickers whose duplicated menu state motivated `BaseSelectMenu`. Four\n  remain (`SdrStepPicker`, `SdrSampleRatePicker`, `SdrDeviceSelector`,\n  `SdrSettingsAccordion`), which is still the case for the primitive.\n- **B8 (descoped):** the `sdr-trunk-hint` paragraph cited as a non-list \"empty\"\n  the primitive could not absorb no longer exists. The descope decision stands\n  on its remaining evidence.\n- **B10c:** the trunk CSS family (`.sdr-trunk-*` and the\n  `#sdr-trunk-section-body` context rules) was co-located into\n  `SdrTrunkSection.vue`, so it was deleted with that component. Co-location is\n  what made this a clean removal rather than a hunt through `SdrPanel.css` —\n  evidence for the B10 policy, not against it.\n\nNothing in the Decision is invalidated: the primitives, the settled co-location\npolicy and the completion status all stand.\n",wn=`# 0003. Lock and tune a Sentry SDR when AIR runs off grid

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
`,Tn=`# 0004. Remove trunk tracking

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
`,En=`# 0005. Sea domain: live vessel tracking via AISStream

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
`,Dn=`# 0006. Sections as separate services behind a gateway

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
`,On="# Backend code\n\nThis page explains how the Python backend is organised: the packages, the rules about who may import whom, how a process is put together, and how its modules start and stop. Read [System overview](overview.md) first.\n\nNew to a term on this page? See the [Glossary](../reference/glossary.md).\n\n## The packages\n\nEvery service runs from the same image and the same Python environment (`backend/pyproject.toml`), but each imports only what it is.\n\n| Package | Folder | What it holds |\n|---|---|---|\n| `backend.core` | `backend/core/` | Core only: the app factory, service registry, gateway sync, notifications, internal auth, SPA serving. |\n| `backend.platform` | `backend/platform/` | Shared by every service: the event bus and NATS transport, module lifecycles, the service SDK, the settings client, credentials, service manifests. |\n| `backend.modules` | `backend/modules/` | Core's own lifecycles (`bus`, `core`) and the section manifest helper. |\n| `backend.routers`, `backend.services` | `backend/routers/`, `backend/services/` | Core's settings and offline-map routers and the code behind them (config file, offline map jobs). |\n| `backend.cache`, `config`, `database`, `utils` | `backend/*.py` | The fresh/stale cache helpers, Pydantic settings (`.env`), the async SQLAlchemy engine, connectivity helpers. |\n| `sentinel_<id>` | `services/sections/<id>/backend/sentinel_<id>/` | One section: `router`, `services/`, `models`, `database` (its tables and seeders), `module` (lifecycle and manifest), `service` (its uvicorn entry point). Tests sit beside it in `tests/`. |\n| `sentinel_radio` | `services/radio/backend/sentinel_radio/` | The radio hub, same layout plus `routers/` and `radios.py`. |\n\nEach section package is an editable path dependency of `backend/pyproject.toml`, so `uv run --project backend …` and the image see it like any installed package.\n\n## Import rules\n\nThe boundaries are checked by import-linter (`PYTHONPATH=. uv run --project backend lint-imports --config backend/pyproject.toml`), which gates CI:\n\n- **Nothing in `backend` imports a section or the radio hub.** Core never even loads their code: sections subscribe to bus events when imported, so a copy inside core would handle events meant for the service. `tests/backend/test_core_entry_point.py` checks this in a fresh interpreter.\n- **No section imports another section.** Sections talk through the event bus and HTTP, never by calling each other.\n- **Only the test app imports everything.** `tests/in_process_app.py` builds one app with every router so the backend tests can use one client. No deployment runs it.\n\n*Figure: Which packages may import which. Arrows point from the importer to what it imports.*\n\n```mermaid\nflowchart TD\n    core[\"backend.core<br/>backend.modules<br/>backend.routers\"] --> platform[\"backend.platform<br/>cache · config · database\"]\n    sections[\"sentinel_air · sentinel_space<br/>sentinel_sea · sentinel_land<br/>sentinel_sdr\"] --> platform\n    radio[\"sentinel_radio\"] --> platform\n    testapp[\"tests/in_process_app.py\"] --> core\n    testapp --> sections\n    testapp --> radio\n    class platform accent\n```\n\n**In words:**\n\n- Core (`backend.core`, `backend.modules`, `backend.routers`) imports the shared platform.\n- Every section package, and the radio hub, imports the shared platform.\n- Core and the sections never import each other, and sections never import each other.\n- Only the test suite's in-process app imports core, every section and the hub together.\n\n## How a process is put together\n\nThere are two composition roots, one per kind of process:\n\n- **Core**: `backend/main.py` is uvicorn's target. It calls `create_core_app()` (`backend/core/app.py`), which mounts core's routers (settings, notifications, offline maps, `/api/app/sections`, `/internal/registry/register`, secret settings), then `/health`, then the static mounts (`/assets/**`, `/spa-assets/**`, `/fonts/**`), and finally a catch-all that serves the shell's `index.html` for any other path, so vue-router can handle it.\n- **A section or the hub**: `sentinel_<id>/service.py` calls `create_service()` (`backend/platform/sdk/`) with the section's routers, lifecycle and manifest. That gives the service its `/health`, its UI remote under `/remotes/<id>/`, a NATS connection, registration with core, and a hold on start-up until core answers.\n\nEvery file the browser loads must sit under one of core's mounts. Anything else at the site root falls through to `index.html`, and the browser rejects it as a module script with a `text/html` type error. That is why the shell's federation entry is `spa-assets/remoteEntry-[hash].js`.\n\n## Module lifecycles\n\nEach module declares a `ModuleLifecycle` (`backend/platform/lifecycle.py`) with up to four optional hooks:\n\n| Hook | Runs | Used for |\n|---|---|---|\n| `prepare` | At start-up, for **every** module before any `start` | Tables, migrations, seed data |\n| `start` | After all `prepare`s, in list order | Background tasks: pollers, sockets, resumed decodes |\n| `stop` | At shutdown, in reverse order | Stopping and awaiting what `start` began |\n| `wake` | On SIGTERM or SIGINT, before uvicorn's own handler | Unblocking long-lived waiters so shutdown and `--reload` don't hang |\n\n*Figure: Start-up and shutdown of one service with two modules.*\n\n```mermaid\nsequenceDiagram\n    participant Uvicorn\n    participant Runner as run_lifecycles\n    participant A as module A\n    participant B as module B\n    Uvicorn->>Runner: lifespan start\n    Runner->>A: prepare()\n    Runner->>B: prepare()\n    Runner->>A: start()\n    Runner->>B: start()\n    Note over Uvicorn,B: serving requests\n    Uvicorn->>Runner: SIGTERM\n    Runner->>A: wake()\n    Runner->>B: wake()\n    Runner->>B: stop()\n    Runner->>A: stop()\n```\n\n**In words:**\n\n1. Every module's `prepare` runs first, in order, so no background task starts against a half-built database.\n2. Then every module's `start` runs, in the same order.\n3. On a shutdown signal, every `wake` hook runs first. It nudges things that wait forever, such as SDR WebSocket queues, decode bridges, the AIS reader and a running `pmtiles extract`.\n4. Then every `stop` runs, in reverse order.\n\nDon't remove the wake chain: without it, long-lived SDR sockets and subprocesses deadlock `uvicorn --reload`.\n\nFor a section service, `create_service()` puts its own hooks around the section's: first a wait for core (a section can't read its settings until core answers), then the NATS connection, and registration last.\n\n## Settings from a service\n\nSettings belong to core. A section reads and writes them through the settings client (`backend/platform/settings_client.py`), which goes over HTTP to core's `/api/settings` when `SENTINEL_CORE_URL` is set. Never read the `user_settings` table from section code. Secrets are handled differently; see [Security](security.md#secrets). How a settings change travels is in [Data stores](data-stores.md#a-settings-change).\n\n## Adding to the backend\n\n- **A route on an existing section:** add it to that section's `router.py`. Its manifest already claims the prefix.\n- **A new path prefix:** add it to the section's manifest `routes` in `module.py`. The gateway picks it up when the service next registers.\n- **A new bus subject:** add it to `backend/platform/nats_permissions.py`, or the broker refuses it. See [Event bus](event-bus.md).\n- **A new service or decoder kind:** give it a row in `backend/platform/service_access.py` and a compose mount of its credentials. See [Security](security.md).\n",kn=`# Caching

Sentinel caches what it fetches so it keeps showing something useful when a feed is slow, rate-limited or gone. This page explains the general pattern and each cache.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Fresh, stale, gone

Most caches use the helpers in \`backend/cache.py\` (\`now_ms\`, \`is_fresh\`, \`is_within_stale\`) with two windows: a **fresh** window, during which the cached copy is served without asking upstream, and a longer **stale** window, during which the cached copy is still served if upstream fails.

*Figure: How a cached request is answered.*

\`\`\`mermaid
flowchart TD
    req["Request"] --> fresh{"Cached copy<br/>still fresh?"}
    fresh -- "Yes" --> hit["Serve cache (HIT)"]
    fresh -- "No" --> fetch["Fetch from upstream"]
    fetch --> ok{"Worked?"}
    ok -- "Yes" --> store["Store, serve (MISS)"]
    ok -- "No" --> stale{"Cached copy inside<br/>the stale window?"}
    stale -- "Yes" --> serveStale["Serve old copy (STALE)"]
    stale -- "No" --> fail["Error, or an empty answer"]
    class fresh accent
\`\`\`

**In words:**

1. If the cached copy is still inside its fresh window, it is served at once.
2. Otherwise upstream is asked. A good answer is stored and served.
3. If upstream fails, a copy still inside the stale window is served instead.
4. Only if there is nothing usable does the request fail.

The windows are settings in \`backend/config.py\`, overridable from \`.env\`.

## The caches

| What | Where | Fresh / stale | Notes |
|---|---|---|---|
| ADS-B aircraft | \`air.db\`, keyed by point and radius | 10 s / 60 s (\`ADSB_TTL_MS\`, \`ADSB_STALE_MS\`) | Response header \`X-Cache\` says how it was answered (below) |
| TLEs | \`space.db\` | 6 h / 12 h (\`TLE_TTL_MS\`, \`TLE_STALE_MS\`); 30 days for uploaded TLEs | An unreachable host is skipped for a while rather than retried for every satellite |
| UK repeaters | \`land.db\`, \`repeater_cache\` | refreshed daily; stale copy used up to 30 days | Then the built-in copy |
| Vessels | Sea's memory, snapshot in \`sea.db\` | 30 min retention | Snapshot every 30 s, loaded at start |
| Offline map tiles | \`.pmtiles\` files | never expire | See below |

### ADS-B's \`X-Cache\` header

Air's \`/api/air/adsb/point/…\` says in \`X-Cache\` how it answered, which helps when the map looks wrong:

| Value | Meaning |
|---|---|
| \`HIT\` | Fresh cached snapshot |
| \`MISS\` | Fetched from upstream now |
| \`BYPASS\` | Fetched, but the cache write failed (database busy); served anyway |
| \`NEARBY\` | No snapshot for this exact point, so the nearest recent one was served |
| \`STALE\` | Upstream failed; an older snapshot inside the stale window was served |
| \`RATED\` | Upstream answered 429 (rate limit); cached snapshot served |
| \`THROTTLED\` | Sentinel's own rate limiter held the request back; cached snapshot served |
| \`FALLBACK\` | The main source failed and the other mode's source answered |

\`X-Snapshot-Age-Ms\` gives the snapshot's age, which the map uses to place aircraft where they are now rather than where they were.

## Offline map tiles

Maps read tiles through two core endpoints, \`GET /api/offline-map/basemap/{z}/{x}/{y}\` and \`/api/offline-map/terrain/{z}/{x}/{y}\`, which look in tiers.

*Figure: Where an offline map tile comes from.*

\`\`\`mermaid
flowchart TD
    tile["Tile request z/x/y"] --> regions{"In a downloaded area?<br/>(newest first)"}
    regions -- "Yes" --> fromRegion["Serve from that<br/>area's .pmtiles"]
    regions -- "No" --> base{"In the base archive?<br/>(frontend/assets/tiles)"}
    base -- "Yes" --> fromBase["Serve from the<br/>base archive"]
    base -- "No" --> empty["204 No Content"]
\`\`\`

**In words:**

1. Downloaded areas are checked newest first; the first one that has the tile serves it.
2. Otherwise the base archive placed by hand in \`frontend/assets/tiles/\` is tried.
3. If neither has it, the answer is \`204 No Content\` and the map leaves that square blank.

Open \`.pmtiles\` readers are kept between requests (\`tile_tier_resolver.py\`). When a download finishes, \`/api/offline-map/status\` reports a new \`tiers_version\`; the map then calls \`setTiles()\` on its sources with a \`?v=\` cache-buster, so it refetches without a full restyle. Don't replace this with \`map.setStyle()\`: it doesn't refetch an unchanged source, and a full restyle wipes the overlay layers.
`,An=`# Section data flows

This page follows the data of each section from its source to the map. Each section is a backend package (\`services/sections/<id>/backend/sentinel_<id>/\`) plus a frontend package (\`services/sections/<id>/frontend/\`); the map features are MapLibre controls under the frontend's \`src/controls/\`.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Air

*Figure: Where aircraft come from, online and off grid, and how emergency squawks become alerts.*

\`\`\`mermaid
flowchart TD
    adsblol["adsb.lol<br/>(online)"] --> router
    readsb["adsb-decoder: readsb<br/>(off grid, Sentry IQ)"] --> router
    browser["AIR map: AdsbLiveControl<br/>polls map centre"] -- "GET /api/air/adsb/point/lat/lon/250" --> router["air: router<br/>+ SQLite cache"]
    router --> browser
    router --> tracker["SquawkTracker"]
    watcher["AdsbWatcher<br/>only while no map polls"] --> router
    tracker -- "air.squawk.changed" --> alerts["emergency → notifications.raise"]
    alerts --> core["core: store alert,<br/>push over SSE"]
    core --> bell["ALERTS in every browser"]
    class router accent
\`\`\`

**In words:**

1. The Air map's \`AdsbLiveControl\` asks the Air service for aircraft within 250 nautical miles of the map centre every few seconds.
2. The Air router answers from its SQLite cache if fresh, otherwise fetches from the active source: adsb.lol online, or the \`adsb-decoder\` off grid (centred on the receiver instead, because a receiver only hears around itself). See [Caching](caching.md).
3. Every snapshot it gets feeds the \`SquawkTracker\`, which publishes \`air.squawk.changed\` when an aircraft's squawk changes.
4. A change to or from 7700, 7600 or 7500 becomes \`notifications.raise\`, which core stores and pushes to every open browser over server-sent events (\`GET /api/air/messages/stream\`).
5. When no browser is polling, the \`AdsbWatcher\` fetches around your location (or the receiver) on its own interval, so emergencies are still noticed. The map only highlights emergencies; it never raises the alert itself.

Off grid, opening Air reserves the chosen Sentry dongle through the hub (\`hub.sentry.…\` requests) and tunes it to 1090 MHz. The \`adsb-decoder\` polls \`/api/sdr/adsb/config\` through the gateway to learn which dongle to read.

## Space

*Figure: From TLE text to positions, passes and an automatic tune.*

\`\`\`mermaid
flowchart LR
    celestrak["CelesTrak<br/>or a .txt upload"] --> tle["space: TLE store<br/>(space.db)"]
    tle --> sgp4["SGP4 propagation"]
    sgp4 --> pos["positions, ground track,<br/>footprint"]
    sgp4 --> passes["passes over<br/>Sentinel Location"]
    pos --> map["SPACE map"]
    passes --> sched["browser: SatellitePassScheduler"]
    sched -- "5 min before rise" --> alert["pass alert"]
    sched -- "at rise / set" --> tune["SDR engine:<br/>tune, record, restore"]
    class sgp4 accent
\`\`\`

**In words:**

1. TLEs come from CelesTrak (**UPDATE TLE**, by category) or an uploaded file, and are stored in \`space.db\` with their category.
2. The Space service propagates orbits with SGP4 to give current positions, the ground track over several orbits, the footprint, and passes over the observer's location.
3. In the browser, a \`SatellitePassScheduler\` per watched satellite fetches its passes, refreshes them every 5 minutes, raises a heads-up alert 5 minutes before rise, and, if auto-tune is on, tunes the SDR engine at rise (and records if asked) and restores it at set.
4. The day/night line comes from \`/api/space/daynight\`.

Because the scheduler runs in the browser, pass alerts and auto-tune need a browser with Sentinel open.

## Sea

*Figure: Two sources of vessels feed one store, so everything after it is the same whichever is live.*

\`\`\`mermaid
flowchart LR
    ais["AISStream WebSocket<br/>(online, one per key)"] --> store
    dec["ais-decoder via radio hub<br/>decode.ais.* (off grid)"] --> adapter["ais_decode: map to an<br/>AISStream-shaped envelope"]
    adapter --> store["AisVesselStore<br/>in memory, by MMSI"]
    store --> snap["sea_vessel_cache<br/>every 30 s (warm start)"]
    store --> api["/api/sea/vessels,<br/>/vessels/{mmsi}/track"]
    api --> map["SEA map:<br/>AisVesselsControl ≤ 1 update/s"]
    class store accent
\`\`\`

**In words:**

1. **Online**, one AISStream WebSocket per process (the service allows one per key) delivers messages for the coverage area. A watchdog reports silence after 2 minutes but reconnects slowly, on a back-off ladder, because a reconnect storm gets the key locked out.
2. **Off grid**, the AIS decoder's messages arrive from the radio hub as \`decode.ais.<radioId>\`. \`ais_decode\` turns each into the same envelope shape AISStream sends.
3. Both feed one \`AisVesselStore\`, keyed by MMSI: static details merged in, a track kept per vessel, vessels dropped after 30 minutes unheard.
4. The store is snapshotted to \`sea_vessel_cache\` every 30 seconds so a restart starts warm.
5. The map fetches vessels and pushes them to MapLibre at most once a second, and only when the source has finished loading; faster starves MapLibre's worker and the map stops drawing.

Off grid, Sea must never start the AISStream reader: there is no internet, and trying burns the reconnect ladder.

## Land

*Figure: Repeaters from a daily download with a built-in fallback; APRS stations from the radio hub.*

\`\`\`mermaid
flowchart LR
    ukr["ukrepeater.net<br/>(daily)"] --> cache["repeater_cache<br/>(land.db)"]
    bundled["uk_repeaters.json<br/>(built in)"] -. "fallback" .-> cache
    cache --> rapi["/api/land/repeaters"]
    hub["radio hub: APRS bridge"] -- "decode.aprs.*" --> stations["APRS stations<br/>(land.db)"]
    stations --> aapi["/api/land/aprs/stations"]
    rapi --> map["LAND map"]
    aapi --> map
    stations --> cleanup["cleanup at start,<br/>then every 24 h"]
\`\`\`

**In words:**

1. The UK repeater directory is downloaded from ukrepeater.net once a day and cached in \`land.db\`. With no internet it falls back to the copy built into Sentinel (\`backend/data/uk_repeaters.json\`, regenerated by \`backend/scripts/refresh_repeaters.py\`).
2. APRS packets arrive from the radio hub's APRS bridge as \`decode.aprs.<radioId>\`; Land stores each station.
3. The map reads both through Land's API and shows one layer at a time. A cleanup loop runs at start and then every 24 hours to delete old stations; it reads the retention setting from core, and retries after a minute if core isn't ready.

## SDR

The SDR section's own data (saved frequencies, groups, search ranges, recordings) goes through its API to \`sdr.db\`; the live radio data goes through the radio hub. Both are covered in [Radios and the SDR pipeline](sdr-pipeline.md).
`,jn=`# Data stores

Every service keeps its own data, and only settings are shared. This page lists what is stored where and who owns it, then follows a settings change from the browser to every service that cares.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Who owns what

All databases are SQLite, used through SQLAlchemy 2.0 in async mode. Each service creates its own tables at start-up, in its lifecycle's \`prepare\` hook; there are no separate migration files.

| Store | Owner | What is in it |
|---|---|---|
| \`sentinel.db\` | core | \`user_settings\` (every setting, as namespace / key / JSON value, including the list of radios, \`sdr.radios\`), alerts, the list of offline map areas |
| Offline map files (\`tiles/\`, beside \`sentinel.db\`) | core | One \`.pmtiles\` file per downloaded area, plus terrain |
| \`backend/data/sentinel_config.json\` | core | A live copy of every setting (see below) |
| \`space.db\` | space | Satellite catalogue and TLEs (the satellite frequencies are a core setting) |
| \`air.db\` | air | ADS-B snapshot cache, tracked aircraft |
| \`sea.db\` | sea | \`sea_vessel_cache\` (a snapshot every 30 s, for warm starts) and \`sea_vessel_static\` (names, callsigns and types) |
| \`land.db\` | land | APRS stations, \`repeater_cache\` (the daily repeater directory) |
| \`sdr.db\` | sdr | Saved frequencies, groups, search ranges, recordings' details |
| Recording files | sdr | \`<id>.wav\` and \`<id>.u8\` |
| \`radio.db\` | radio | Sentry hosts |
| In memory only | each service | The service registry (core), live vessels (sea), radio connections (radio) |

Which file and Docker volume each database lives in, and how tables and starting data are created, is in [Databases](databases.md); the volumes are also in [How Sentinel runs in Docker](docker.md#where-data-is-kept).

## Settings belong to core

A section's settings are stored by core, not by the section. Sections read and write them over HTTP through the **settings client** (\`backend/platform/settings_client.py\`), never by opening \`user_settings\` themselves. That keeps one copy of every setting, which the config file and every browser can see.

## A settings change

*Figure: What happens between selecting APPLY CHANGES and every part of Sentinel using the new value.*

\`\`\`mermaid
sequenceDiagram
    participant UI as Settings page
    participant Core as core
    participant File as sentinel_config.json
    participant Bus as event bus / NATS
    participant Sea as sea service
    UI->>UI: changes held until APPLY CHANGES
    UI->>Core: PUT /api/settings/sea/coverageArea
    Core->>Core: write user_settings, commit
    Core->>File: rewrite the file (commit hook)
    Core->>Bus: publish settings.changed.sea
    Bus->>Sea: settings.changed.sea
    Sea->>Core: read new value (settings client)
    Sea->>Sea: resubscribe AISStream with new area
    Core-->>UI: 200
    UI->>Core: GET /api/settings
    UI->>UI: apply to every store in place,<br/>dispatch sentinel:config-uploaded
\`\`\`

**In words:**

1. Controls on the Settings page **stage** their change; nothing is sent until **APPLY CHANGES**.
2. Applying sends each change to core, which writes it to \`user_settings\`.
3. A hook on that database commit rewrites \`sentinel_config.json\`.
4. Core publishes \`settings.changed.<namespace>\` on the bus.
5. Any service that subscribed (here Sea) reads the new value through the settings client and acts on it.
6. The browser reloads all settings and applies them to its stores **in place**, with no page reload, then fires a \`sentinel:config-uploaded\` event.

Anything in the frontend that reads a setting only once (when it mounts, for example) must also re-read it on \`sentinel:config-uploaded\`, or it stays stale until the next full page load.

## Editing the config file

The config file is two-way. Core polls it every second (polling, because file-change events don't cross a Docker Desktop bind mount). A saved edit is validated and applied through the same code as an upload in **Settings › App Settings › Application Config**; core then marks the settings as externally edited, and open browsers refresh in place (\`useConfigFileSync\`). A file that doesn't parse or validate is logged and ignored, and is overwritten by the next settings change.

## Secrets

Secret settings (today only the AISStream key) are kept out of the public settings API, the config file and exports. How they are stored and who may read them is in [Security](security.md#secrets).
`,Mn='# Databases\n\nThis page explains how Sentinel\'s databases are set up, filled with their starting data, changed when the code changes, edited, and backed up. [Data stores](data-stores.md) has the list of what each one holds.\n\nNew to a term on this page? See the [Glossary](../reference/glossary.md).\n\n## One SQLite file per service\n\nEvery service has its own SQLite database file, on its own Docker volume:\n\n| Service | File (inside its container) | Volume |\n|---|---|---|\n| app (core) | `/app/data/sentinel.db` | `sentinel_db` |\n| space | `/app/data/space.db` | `space_data` |\n| land | `/app/data/land.db` | `land_data` |\n| air | `/app/data/air.db` | `air_data` |\n| sea | `/app/data/sea.db` | `sea_data` |\n| sdr | `/app/data/sdr.db` | `sdr_data` |\n| radio | `/app/data/radio.db` | `radio_data` |\n\nThe file is set by the `DB_PATH` environment variable in `docker-compose.yml`. No service opens another service\'s file: if Sea needs a setting, it asks core over HTTP.\n\n### How a connection is set up\n\n`backend/database.py` builds one async SQLAlchemy engine per process (`sqlite+aiosqlite:///<DB_PATH>`), and every connection it opens sets three SQLite options:\n\n- `journal_mode=WAL` (write-ahead logging: changes go to a side file, `<name>.db-wal`, and are folded into the database later), so readers aren\'t blocked while something writes;\n- `busy_timeout=5000`, so a writer waits up to 5 seconds for the lock instead of failing with "database is locked";\n- `synchronous=NORMAL`, a safe, faster setting for WAL.\n\nRequest handlers get a session with `Depends(get_db)`. Background tasks open their own with `AsyncSessionLocal()`. Models are declared on one shared `Base` (`backend/database.py`), but each service creates only its own tables.\n\n## How tables are created and changed\n\nThere are no migration files. Each service builds its schema from its ORM models every time it starts, in its lifecycle\'s `prepare` hook, before anything else runs.\n\n*Figure: What a service does to its database on every start, in order.*\n\n```mermaid\nflowchart TD\n    start["Service starts: prepare()"] --> create["create_all: create any<br/>table that doesn\'t exist"]\n    create --> alter["ALTER TABLE … ADD COLUMN<br/>for columns added since<br/>(already there? ignored)"]\n    alter --> backfill["Backfill new columns<br/>on old rows"]\n    backfill --> legacy["First boot only: copy its tables<br/>from the old sentinel.db"]\n    legacy --> seed["Seed starting data<br/>where nothing exists yet"]\n    seed --> ready["start(): background work begins"]\n    class seed accent\n```\n\n**In words:**\n\n1. **Create.** `Base.metadata.create_all` creates every table of this service that doesn\'t exist yet. Core uses `create_tables()`; a section uses `create_section_tables(<its tables>)` (`backend/database.py`), called from its own `database.py`, such as `create_sdr_tables()`.\n2. **Add new columns.** `create_all` never changes an existing table, so each column added after a table\'s first release is listed as an `ALTER TABLE … ADD COLUMN` statement (for example `SDR_ADDED_COLUMNS` in `sentinel_sdr/database.py`). Each runs on every start; if the column is already there, SQLite raises an error that is ignored.\n3. **Backfill.** Rows created before a column existed are given sensible values, only where still empty, so this is safe to repeat.\n4. **Copy legacy data, once.** Sections used to share core\'s database. On a section\'s first start, `import_legacy_tables` (`backend/platform/sdk/legacy_import.py`) copies each of its tables that is still empty from the old `sentinel.db`, mounted read-only at `/legacy`. A table that already has rows is never touched, so this does nothing after the first time.\n5. **Seed** starting data (next section).\n\nRemoved features clean up after themselves the same way: core drops their tables (`_REMOVED_TABLES`) and deletes their settings (`prune_removed_settings`) on start.\n\n### Changing the schema\n\n- **New table:** add the model to the section\'s `models.py`, and its name to the section\'s table list (for example `SDR_TABLES`). It is created on the next start.\n- **New column:** add it to the model **and** add an `ALTER TABLE … ADD COLUMN` line to the section\'s added-columns list, with a default. Without the `ALTER`, existing installs never get the column. Add a backfill if old rows need a real value.\n- **Renamed or removed column:** SQLite can\'t do this in place safely. Add a new column and stop using the old one.\n- **Test it** against a database made by the previous version, not only a fresh one.\n\n## How data gets in at first\n\n| Data | Source file | Loaded by | When |\n|---|---|---|---|\n| Every default setting | `backend/default_config.json` | `seed_default_settings()` (core) | Every start: only settings that have no row yet are added, so your values are never overwritten |\n| Saved frequencies, groups, search ranges | `backend/data/sdr_frequencies.json` | `seed_sdr_data_from_files()` (sdr) | First start, while the tables are empty |\n| SDR band plan | `backend/data/sdr_bandplan.json` | `seed_sdr_bandplan_from_file()` (sdr), into the `sdr.bandPlan` setting | First start |\n| Satellite frequencies | `backend/data/satellite_radio.json` | `backfill_satellite_radio_store()` (space), into core\'s settings | Every start, reconciled |\n| UK repeaters | `backend/data/uk_repeaters.json` (built-in copy) | Land | When there is no fresher download |\n\nSome values in `default_config.json` can be overridden from `.env` when they are first seeded, such as the ADS-B feed (`ADSB_UPSTREAM_BASE`), the CelesTrak address and the APRS channel.\n\nEverything else arrives while Sentinel runs: aircraft, ships, TLEs and repeaters from their feeds or your radios, and your own changes.\n\n## How data is edited\n\n*Figure: The ways data is changed, and which store each one writes.*\n\n```mermaid\nflowchart LR\n    ui["Settings page<br/>APPLY CHANGES"] --> api["core: /api/settings"]\n    file["sentinel_config.json<br/>edited by hand"] --> api\n    upload["Application Config<br/>EDIT / upload"] --> api\n    api --> settingsDb[("sentinel.db<br/>user_settings")]\n    panel["SDR panel, Land, Space<br/>(save frequency, track, …)"] --> sectionApi["section\'s own API<br/>/api/sdr/…, /api/air/…"]\n    json["JSON editors in Settings<br/>Frequencies & Groups, Band Plan,<br/>Repeater Directory"] --> sectionApi\n    sectionApi --> sectionDb[("section\'s own .db")]\n    sectionApi -. "mirror, e.g. sdr.frequencies" .-> api\n```\n\n**In words:**\n\n1. **Settings** go to core\'s `/api/settings`, whether from the Settings page, a hand edit of `sentinel_config.json`, or **Application Config**. Core writes them to `user_settings` in `sentinel.db`. The whole journey is in [Data stores: A settings change](data-stores.md#a-settings-change).\n2. **A section\'s own data** (saved frequencies, tracked aircraft, recordings) goes through that section\'s API to its own database.\n3. **The JSON editors** in Settings (**Frequencies & Groups (JSON)**, **Band Plan (JSON)**, **Satellite Frequencies (JSON)**, **Repeater Directory (JSON)**) replace a whole data set through the owning section\'s API.\n4. Some section data is **mirrored** into a setting so the config file shows it: after every edit the SDR section writes its frequencies, groups and search ranges to `sdr.frequencies`, `sdr.groups` and `sdr.searchRanges`. The tables remain the source of truth.\n\n### Looking inside a database\n\nTo read a database yourself, copy it out of its container and open it with any SQLite tool (the `sqlite3` command, or DB Browser for SQLite):\n\n```bash\ndocker compose cp sea:/app/data/sea.db ./sea.db\nsqlite3 ./sea.db ".tables"\n```\n\nDon\'t edit a live database by hand: the service caches some data in memory and would overwrite or ignore your change. Change data through the app, the config file, or the JSON editors. If you must edit a file directly, stop that service first (`docker compose stop sea`), and start it again afterwards.\n\n## Backing up and restoring\n\nEvery database is on a Docker volume. Stop Sentinel before copying one, so each database is closed and its write-ahead log (WAL) file is folded back in. The steps, and which volumes are worth keeping, are in [Check logs, health and backups](../operations.md#what-to-back-up).\n\n## In tests\n\nBackend tests never touch a real database file. The root `conftest.py` swaps in an in-memory SQLite engine (one connection shared through `StaticPool`), overrides `get_db`, imports every section\'s models so all tables exist, and skips lifespans, so the seeders don\'t run unless a test calls them.\n',Nn=`# Decoding

This page explains how decoders turn radio signals into data inside Sentinel. To use decoders, see [Decode digital signals](../use/sdr/decode.md); to install them, see [Install and run decoders](../decoders.md).

New to a term on this page? See the [Glossary](../reference/glossary.md).

## The idea

A dongle has one connection, and the radio hub already reads it. So decoders never connect to the dongle themselves. Instead the hub demodulates the signal and serves the decoder **audio**, the same way a scanner's speaker output would feed a decoder program. The decoder sends back what it decoded.

Three decoders work this way, through a shared **PCM bridge** in the hub (\`sentinel_radio/services/sdr_decode.py\`):

| Decoder | Program | Hub port | Audio | Sends back |
|---|---|---|---|---|
| Digital voice | dsd-fme | 7355 | 48 kHz mono | Call details, and decoded voice (UDP) |
| APRS | Direwolf | 7357 | 48 kHz mono | APRS packets |
| AIS | Direwolf 1.8 | 7358 | 48 kHz **stereo**: channel A left, B right | AIS messages |

The fourth, **ADS-B**, is different: 1090 MHz needs the raw samples, not audio, so \`readsb\` reads IQ straight from a Sentry dongle's \`rtl_tcp\` and serves aircraft as JSON, which Air polls (see [Section data flows](data-flows.md#air)).

## A decoder's life cycle

*Figure: An APRS decoder from start-up to a station appearing on the Land map.*

\`\`\`mermaid
sequenceDiagram
    participant Dec as aprs-decoder
    participant Hub as radio hub
    participant Bus as NATS
    participant Land as land service
    Dec->>Hub: GET /api/sdr/aprs/config (via gateway, X-Decode-Secret)
    Hub-->>Dec: radio, pcmFeed host:port
    Dec->>Hub: connect TCP to pcmFeed
    loop while decoding
        Hub->>Hub: IQ → shift → filter → FM demod → 48 kHz PCM
        Hub->>Dec: PCM audio
        Dec->>Dec: Direwolf decodes a packet
        Dec->>Hub: POST /api/sdr/aprs/ingest (packet)
        Hub->>Bus: publish decode.aprs.<radioId>
        Bus->>Land: decode.aprs.<radioId>
        Land->>Land: store station
    end
\`\`\`

**In words:**

1. The decoder container starts and asks the hub, through the gateway, what to decode. It authenticates with its own credential in the \`X-Decode-Secret\` header.
2. The hub replies with which radio is assigned and the address of the PCM feed (\`pcmFeed\`). The decoder never needs to know which container runs the hub.
3. The decoder connects to that feed. The hub subscribes to the radio's IQ broadcaster (the same one the waterfall uses), demodulates the channel and streams 48 kHz audio.
4. Each time the decoder decodes something, it posts it to the hub's ingest route (\`/api/sdr/aprs/ingest\`; voice and AIS have their own).
5. The hub publishes it on the bus as \`decode.<kind>.<radioId>\`.
6. The section that cares (Land for APRS, Sea for AIS) receives it and stores it.

If the hub isn't up yet, the decoder retries quietly.

## Owning a channel

The voice decoder decodes whatever the radio panel is tuned to. APRS and AIS instead **own an absolute channel** (\`ChannelOwningDecodeBridge\`): they tune the dongle themselves when they start, and each chunk of audio is demodulated at the offset worked out from the frequency that chunk was actually captured on. So someone moving the view within the band does no harm. If something tunes the dongle away from the channel, the bridge pulls it back after about 15 seconds.

AIS owns **two** channels 50 kHz apart (161.975 and 162.025 MHz). The hub parks the dongle between them, demodulates both from the same samples and interleaves them as stereo, so one two-channel Direwolf hears both. Decoding only one would lose about half the traffic.

## Adding a new decoder kind

New decoders need no hub code. A decoder container registers a **decoder manifest** (\`POST /api/sdr/decoders/register\`, \`sentinel_radio/services/decoder_manifest.py\`) naming its kind, its channel or channels, and whether it owns them. The hub then runs a generic bridge for it (\`manifest_decode.py\`), starts and stops it through \`/api/sdr/decoders/{kind}/…\` or \`hub.decode.<kind>.…\` on the bus, and publishes its events as \`decode.<kind>.<radioId>\`. Registration is held in memory, so when a registered decoder's \`/config\` poll gets a 404 (the hub restarted), it registers again.

You still need to:

1. give the kind a row in \`backend/platform/service_access.py\` and a compose mount of its \`credentials/<kind>-decoder/\` folder, so it can authenticate ([Security](security.md));
2. add a subscriber for \`decode.<kind>.*\` where the data should go, and that subject to \`nats_permissions.py\` ([Event bus](event-bus.md)).

The **stub decoder** (\`decoder/stub/\`, compose profile \`decoder-stub\`) follows this contract without decoding anything. \`tests/backend/test_decoder_stub_contract.py\` runs it against the real app in CI, so it is a working template.
`,Pn=`# How Sentinel runs in Docker

Sentinel runs entirely in Docker. This page explains, from scratch, what Docker Compose starts, how the images are built, where data is kept, and how your code edits reach the running app. If you have used Docker before, skim the first section.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Docker in two minutes

- An **image** is a packaged program with everything it needs: Python, libraries, Sentinel's code. It is built once from a recipe called a **Dockerfile**.
- A **container** is a running copy of an image. Several containers can run from one image, each doing a different job.
- **Docker Compose** starts a set of containers together from one file, \`docker-compose.yml\`. Each entry under \`services:\` there becomes one container.
- A **volume** is storage Docker keeps for a container, which survives when the container is removed or rebuilt. A **bind mount** instead shows a folder from your computer inside a container, so edits on your computer appear inside it straight away.
- A **network** lets containers reach each other by service name: the Sea container reaches core at \`http://app:8000\`.
- A **profile** marks a service as optional: it only starts when you ask for that profile.
- A **one-shot** container does one job and exits.
- A container is **healthy** when its health check (here, a request to \`/health\`) passes.
- \`ports:\` in the compose file publishes a container's port on your computer; \`expose:\` only opens it to other containers on the same network.

## What \`docker compose up\` starts

*Figure: The containers a plain \`docker compose up\` starts, what each runs, and the order they wait for each other.*

\`\`\`mermaid
flowchart TD
    creds["service-credentials<br/>one-shot: writes certificates<br/>and credentials, then exits"] --> nats["nats<br/>event bus"]
    creds --> app["app<br/>core: uvicorn backend.main:app"]
    nats --> app
    app --> gateway["gateway<br/>Caddy, publishes :8080"]
    app --> sections["space · land · air · sea · sdr<br/>uvicorn sentinel_(id).service:app"]
    nats --> sections
    app --> radio["radio<br/>uvicorn sentinel_radio.service:app"]
    nats --> radio
    class gateway accent
\`\`\`

**In words:**

1. \`service-credentials\` runs first and exits. It creates a certificate authority for this installation, TLS certificates, and a separate login for every service and decoder, on the \`service_credentials\` volume.
2. \`nats\`, the event bus, starts with those certificates.
3. \`app\` (core) starts once both are ready.
4. The \`gateway\` starts and publishes port 8080, the only port a browser uses.
5. Every section (\`space\`, \`land\`, \`air\`, \`sea\`, \`sdr\`) and the radio hub (\`radio\`) start once core reports healthy. Each one still waits for core to answer before it does any work (see [Services and start-up](services.md)).

All of them are on one Docker network called \`sentinel\`.

### Ports and optional containers

Core and the sections listen on port 8000 **inside** the network only (\`expose\`, not \`ports\`), so a browser can't reach them except through the gateway, which publishes port 8080. The decoders are **profiles**: optional containers that start only with \`--profile <name>\`.

Every port, profile and container is listed in [Ports and services](../reference/ports-and-services.md).

## One image for every Python service

\`app\`, every section, the radio hub and \`service-credentials\` all run the **same image**, built from \`backend/Dockerfile\`. Only the start command differs: \`uvicorn backend.main:app\` for core, \`uvicorn sentinel_sea.service:app\` for Sea, and so on. The gateway and NATS use stock images (\`caddy\`, \`nats\`); each decoder has its own small Dockerfile.

*Figure: The three stages of \`backend/Dockerfile\` and what each passes to the next.*

\`\`\`mermaid
flowchart LR
    subgraph stage1["Stage 1: spa-builder (Node 24)"]
        npm["npm ci<br/>(workspace root)"] --> build["npm run build<br/>shell + every section remote<br/>+ bundled docs"]
    end
    subgraph stage2["Stage 2: pmtiles-fetcher"]
        pm["download go-pmtiles,<br/>check its SHA-256"]
    end
    subgraph stage3["Stage 3: runtime (Python 3.12)"]
        uv["uv sync<br/>backend + every section package"] --> code["copy backend/ and<br/>services/*/backend/"]
    end
    build -- "frontend/spa-dist/" --> stage3
    pm -- "pmtiles binary" --> stage3
    class stage3 accent
\`\`\`

**In words:**

1. **Stage 1** installs the JavaScript workspace and builds the browser app: the shell, each section's UI remote, and these docs. It runs on your own machine's architecture even when building for another, because the output is plain JavaScript and CSS.
2. **Stage 2** downloads the \`pmtiles\` tool used for offline map downloads, and checks it against a pinned checksum.
3. **Stage 3** is what runs. It installs the Python dependencies with \`uv\` (dependency files first, so Docker can reuse that layer when only code changes), copies in the backend and every section package, and takes the built app from stage 1 and \`pmtiles\` from stage 2. It runs as an unprivileged user, with a health check on \`/health\`.

## Where data is kept

*Figure: Each service and the volumes it writes to. Every service owns its own database; only core's is read by the others, once.*

\`\`\`mermaid
flowchart LR
    app["app"] --> sentinel_db[("sentinel_db<br/>sentinel.db, offline map areas")]
    space["space"] --> space_data[("space_data<br/>space.db")]
    land["land"] --> land_data[("land_data<br/>land.db")]
    air["air"] --> air_data[("air_data<br/>air.db")]
    sea["sea"] --> sea_data[("sea_data<br/>sea.db")]
    sdr["sdr"] --> sdr_data[("sdr_data<br/>sdr.db")]
    sdr --> sdr_recordings[("sdr_recordings<br/>or your own folder")]
    radio["radio"] --> radio_data[("radio_data<br/>radio.db: Sentry hosts")]
    creds["service-credentials"] --> service_credentials[("service_credentials<br/>CA, certificates, logins")]
\`\`\`

**In words:**

| Volume | Written by | Holds |
|---|---|---|
| \`sentinel_db\` | app | Core's \`sentinel.db\` (settings, alerts, offline map areas list) and downloaded map files |
| \`space_data\`, \`land_data\`, \`air_data\`, \`sea_data\` | that section | Its own \`<id>.db\` |
| \`sdr_data\` | sdr | \`sdr.db\` and older recordings |
| \`sdr_recordings\` | sdr | Recordings, unless \`SENTINEL_RECORDINGS_DIRECTORY\` points at a folder on your computer |
| \`radio_data\` | radio | \`radio.db\`: the Sentry hosts |
| \`service_credentials\` | service-credentials | Each service's credentials, in its own \`credentials/<name>/\` folder; each container mounts only its own |

\`docker compose down\` keeps volumes. \`docker compose down -v\` deletes them, and with them every setting, recording and download.

Each section also mounts \`sentinel_db\` read-only at \`/legacy\`: on its first start it copies its own tables out of the old single database, from before sections had databases of their own.

## How your edits reach the running app

The compose file is set up for development as well as use, so you don't rebuild images while you work.

*Figure: The development loop. Backend code is bind-mounted and reloads itself; frontend code is served by Vite with hot reload.*

\`\`\`mermaid
flowchart LR
    subgraph laptop["Your computer"]
        py["backend/ and<br/>services/*/backend/"]
        vue["frontend/vue/, platform/web/,<br/>services/*/frontend/"]
        vite["Vite dev server<br/>:5173"]
        dist["frontend/spa-dist/"]
    end
    subgraph docker["Docker"]
        svc["app · sections · radio<br/>uvicorn --reload"]
        gw["gateway :8080"]
    end
    py -- "bind mount" --> svc
    dist -- "bind mount, read-only" --> svc
    vue --> vite
    vite -- "proxies /api, /ws, /assets" --> gw
    gw --> svc
    class vite accent
\`\`\`

**In words:**

1. Backend folders are bind-mounted into the containers, and every Python service runs \`uvicorn --reload\`. Save a \`.py\` file and that service restarts itself in a second or two.
2. For frontend work, run \`cd frontend/vue && npm run dev\` and open **http://localhost:5173**. Vite serves the Vue code with hot reload and passes API and WebSocket calls through to the gateway on :8080.
3. What :8080 serves is the **built** app in \`frontend/spa-dist/\`, bind-mounted read-only. \`npm run build\` in \`frontend/vue\` regenerates it; reload the browser to see it. That folder is committed, because it is what a deployment serves.

You need \`docker compose up --build\` only when dependencies change (\`pyproject.toml\`, \`package.json\`) or for the docs and other files copied into the image.

## Everyday commands

The commands you'll use most (start, rebuild, check, follow logs, restart one service) are in [Check logs, health and backups](../operations.md#everyday-commands).
`,Fn='# Event bus\n\nSections never import or call each other. When one needs to tell another something, or ask it to do something, it goes through the **event bus**: `backend/platform/bus.py`, carried between processes by [NATS](https://nats.io). This page explains how it works and how to add an event.\n\nNew to a term on this page? See the [Glossary](../reference/glossary.md).\n\n## Publish, subscribe, request\n\nEvents have dotted names called **subjects**, such as `settings.changed.sea` or `decode.ais.3`. A handler subscribes to a pattern: `*` matches one part, `>` matches the rest.\n\n- `bus.publish(subject, payload)`: tell anyone interested. Every handler in **this** process runs, and is awaited, before `publish` returns. Then the event goes to NATS for other processes.\n- `bus.subscribe(pattern, handler)`: run `handler` for every matching event, from this process or another.\n- `bus.request(subject, payload)`: ask for an answer. A responder in this process answers directly; otherwise the request goes over NATS and the reply comes back on the requester\'s own inbox.\n\n*Figure: One publish reaches local handlers first, then other processes through NATS. A request with no local responder crosses NATS to the service that answers it.*\n\n```mermaid\nflowchart LR\n    subgraph radio["radio process"]\n        pub["bus.publish<br/>decode.aprs.3"] --> localH["local handlers<br/>(awaited)"]\n        resp["responder<br/>hub.decode.ais.start"]\n    end\n    pub --> nats(("NATS"))\n    nats --> land["land process<br/>handler for decode.aprs.*"]\n    subgraph sea["sea process"]\n        req["bus.request<br/>hub.decode.ais.start"]\n    end\n    req -- "no local responder" --> nats\n    nats --> resp\n    resp -- "reply on _INBOX.sea" --> nats\n    nats --> req\n    class nats accent\n```\n\n**In words:**\n\n1. The radio hub publishes `decode.aprs.3` (an APRS packet heard on radio 3). Its own handlers run first, then the event goes to NATS.\n2. NATS delivers it to the Land service, which subscribed to `decode.aprs.*` and stores the station.\n3. Sea asks the hub to start its AIS decoder with a request on `hub.decode.ais.start`. Sea has no local responder, so the request crosses NATS.\n4. The hub\'s responder handles it and replies on Sea\'s private inbox, `_INBOX.sea`.\n\n## Rules that keep it working\n\n- **Low-rate control events only.** Settings changes, decoded packets, start and stop requests. Never put spectrum, IQ or audio data on the bus; those have their own paths ([Radios and the SDR pipeline](sdr-pipeline.md)).\n- **Payloads are JSON.** A handler may receive a `db` session: it is stripped before the event leaves the process, and the receiving process injects its own, so handlers keep the same signature either way.\n- **Errors come back.** A remote responder\'s exception arrives as `RemoteHandlerError`.\n- **No echo.** Each process connects with NATS\'s `no_echo`, because its local handlers have already run. Removing it would handle every event twice.\n- **A missing broker never blocks.** Services start without NATS and connect when it appears; publishing never waits for it.\n\n## Who may use which subject\n\nUnder Docker the broker requires TLS, and each process signs in as its own NATS user: `core` for the app, otherwise the service\'s id. The broker only allows each user the subjects listed in `backend/platform/nats_permissions.py`:\n\n| User | Publishes | Subscribes to | Requests |\n|---|---|---|---|\n| `core` | everything | everything | (answers requests) |\n| `radio` | `decode.>` | `hub.>`, `settings.changed.land`, `sdr.decode.radio-reassigned` | (answers requests) |\n| `air` | `notifications.raise`, `air.squawk.changed` | `air.squawk.changed` | `hub.sentry.>` |\n| `sea` | — | `decode.ais.*`, `settings.changed.sea`, `settings.changed.app` | `hub.decode.ais.>` |\n| `land` | — | `decode.aprs.*` | — |\n| `sdr` | — | — | `hub.iq-capture.>` |\n| `space` | — | — | — |\n\n## Common subjects\n\n| Subject | Published by | Means |\n|---|---|---|\n| `settings.changed.<namespace>` | core (and the settings client) | A setting in that namespace changed |\n| `registry.changed` | core | A service registered, or became available or unavailable |\n| `notifications.raise` | a section | Store this alert and push it to browsers |\n| `decode.<kind>.<radioId>` | radio hub | A decoder heard something (`aprs`, `ais`, or a registered kind) |\n| `hub.decode.<kind>.{start,stop,status}` | a section (request) | Start, stop or query a decoder |\n| `hub.sentry.…` | air (request) | Reserve a Sentry dongle, or ask where a receiver is |\n| `hub.iq-capture.{locate,list,discard}` | sdr (request) | Find, list or drop a raw IQ capture |\n| `air.squawk.changed` | air | An aircraft\'s squawk code changed |\n\n## Adding a subject\n\n1. Publish or subscribe to it in code.\n2. Add it to the right user\'s row in `backend/platform/nats_permissions.py`. Without this the broker refuses it: the service logs a NATS **permissions violation** and the event never leaves its process.\n3. Run `docker compose up -d` (rewrites `nats.conf`), then `docker compose restart nats` (the broker reads its config only at start).\n',In="# Frontend\n\nThe frontend is a Vue 3 single-page app written in TypeScript, built with Vite, with Pinia for state and vue-router for pages. Maps are MapLibre GL. This page explains how it is split into packages, how it boots, how sections plug into it, and where state lives.\n\nNew to a term on this page? See the [Glossary](../reference/glossary.md).\n\n## Packages\n\nThe frontend is an **npm workspace**: one `npm ci` at the repository root installs everything into one `node_modules`, and the packages import each other from source (no build step between them).\n\n| Package | Folder | What it holds |\n|---|---|---|\n| The **shell** (the app) | `frontend/vue/` | `App.vue`, the router, the section menu, sidebar, footer, the Settings and Docs pages, and the code that loads sections |\n| `@sentinel/ui` | `platform/web/ui/` | Generic building blocks: `Base*` components (buttons, fields, accordions, data grids), icon rail, overlays, DOM composables. Depends only on Vue. |\n| `@sentinel/shell-api` | `platform/web/shell-api/` | The contract between shell and sections: registries, capabilities, the shared Pinia stores (`app`, `settings`, `theme`, `basemap`, `notifications`, `offlineMaps`, `sentrySites`, `tracking`), the settings kit sections build their settings from |\n| `@sentinel/map-kit` | `platform/web/map-kit/` | `MapLibreMap.vue`, `SentinelControlBase`, map controls more than one section uses (names, roads, terrain, range rings, Sentry sites, zoom), map composables |\n| `@sentinel/web-config` | `platform/web/config/` | Shared TypeScript, ESLint, Prettier and Vitest configuration |\n| `@sentinel/section-<id>` | `services/sections/<id>/frontend/` | One section's views, map controls, stores, settings and its `src/section.ts` |\n\n*Figure: Which packages may import which. Arrows point from the importer to what it imports.*\n\n```mermaid\nflowchart TD\n    shell[\"shell: frontend/vue\"] --> sections[\"@sentinel/section-air, -space,<br/>-sea, -land, -sdr\"]\n    shell --> mapkit[\"@sentinel/map-kit\"]\n    sections --> mapkit\n    sections --> shellapi[\"@sentinel/shell-api\"]\n    mapkit --> shellapi\n    shellapi --> ui[\"@sentinel/ui\"]\n    shell --> shellapi\n    class shellapi accent\n```\n\n**In words:**\n\n- `@sentinel/ui` depends on nothing but Vue.\n- `@sentinel/shell-api` builds on `ui`; `@sentinel/map-kit` builds on both.\n- Each section imports only `ui`, `shell-api`, `map-kit` and itself: never another section, never the shell. The ESLint rule `noSectionImports` fails the build if one tries.\n- Only the shell's composition root, `frontend/vue/src/shell/sections.ts`, imports the section packages (and only in development and tests; see below).\n- Packages use relative imports internally, never the shell's `@/` alias.\n\n## How the shell boots\n\n*Figure: What happens between opening Sentinel and the first page appearing.*\n\n```mermaid\nsequenceDiagram\n    participant Browser\n    participant Shell as shell (main.ts)\n    participant Core as core\n    participant Remote as section remotes\n    Browser->>Core: GET / → index.html, shell bundle\n    Shell->>Core: GET /api/settings (started now, awaited later)\n    Shell->>Core: GET /api/app/sections\n    Core-->>Shell: [{id: \"air\", remoteEntry: \"/remotes/air/remoteEntry.js\"}, …]\n    Shell->>Remote: load each remoteEntry.js (in parallel)\n    Shell->>Shell: call each section's register(), in menu order\n    Shell->>Shell: apply settings to every store\n    Shell->>Shell: start SDR engine, create router\n    Shell->>Browser: mount App\n```\n\n**In words:**\n\n1. The browser loads `index.html` and the shell's bundle from core.\n2. The shell starts fetching all settings, and at the same time asks core which sections this deployment has (`/api/app/sections`).\n3. It loads each section's **remote** (a separately built bundle, served by that section's own service at `/remotes/<id>/remoteEntry.js`) with Module Federation, in parallel. Only same-origin `/remotes/<id>/` entries are trusted.\n4. It calls each section's `register()` in order. Registration adds the section's route, menu entry, settings, sidebar buttons and so on to the shell's registries.\n5. It applies the settings to every store, including each section's, through the hydrators the sections registered.\n6. It starts the SDR engine (the always-present radio pane), creates the router, waits for the first navigation, and mounts the app.\n\nIf a section's remote fails to load, or its `register()` throws, the shell registers a stand-in so its menu entry still shows and its page says it is unavailable; the rest of the app is unaffected.\n\n**In development and tests** there is no federation: `src/shell/sections.ts` imports the section packages directly, so Vite hot-reloads them like the rest of the app. The production build swaps in `sections.federated.ts` (an alias in `vite.config.ts`). The shared packages are provided by the shell to every remote, so sections never carry their own copies of Vue, Pinia or the `@sentinel/*` packages.\n\n## How a section plugs in\n\nA section's `src/section.ts` exports `register(shell)`. Everything it adds goes through registries and capabilities in `@sentinel/shell-api/shell/`:\n\n| Registry or capability | What a section adds |\n|---|---|\n| `sectionRegistry` | Its id, menu label and order, whether it is on by default, its route and view |\n| `settingsRegistry` | Its Settings menu entry and each setting row (label, description, search terms, control) |\n| `settingsHydration` | A function that applies its settings from `/api/settings` to its stores |\n| `sidebarRegistry` | Its **FILTER** sub-buttons, and extra rail buttons such as **PASSES** |\n| `footerRegistry` | Items shown in the footer on every page, such as SDR's tuned frequency |\n| `notificationRegistry` | How to find an alert's subject, and the alert subscriptions listed in Settings |\n| `backgroundServices` | Work that runs whatever page is open, such as Space's pass scheduler |\n| `capabilities` (`radio`, `radioSites`) | Services one section offers others. SDR provides `radio`, so Air, Sea, Land and Space can tune it without importing SDR. |\n\nCross-section needs always go through a capability. That is how selecting an airport frequency in Air tunes the radio in SDR.\n\n## Pages and routes\n\n| Route | Shows |\n|---|---|\n| `/<id>/` | A section's view, such as `/air/` |\n| `/settings/<section>` | The Settings page (`router/settingsRoute.ts`). It is a real page: the section view unmounts (the SDR engine, outside `<RouterView>`, keeps playing) and closing returns to where you were. |\n| `/doc/<path>` | These docs (`router/docsRoute.ts`, code in `src/docs/`). The markdown in `docs/` is bundled at build time with `import.meta.glob`, rendered with markdown-it and DOMPurify, with Mermaid loaded only for pages that have a diagram. The menu is `docs/nav.json`. |\n\nA navigation guard sends a disabled section's route to the first enabled section instead.\n\n## State\n\n- **Shared stores** (`@sentinel/shell-api/stores/*`): `app` (enabled sections, connectivity mode), `settings` (the raw settings and whether Settings is open), `theme`, `basemap`, `notifications`, `offlineMaps`, `sentrySites`, `tracking`.\n- **Section stores** live in the section package (`src/stores/`).\n- **Persisted choices**: `_persist` backs selected store state with `localStorage`, reconciled against the backend at load. The backend is authoritative for settings.\n- **State that must survive a remount** (which pane or tab is open) belongs in a store, not in a component's local refs: sidebar panes are teleported, and remounts happen.\n- **Settings refresh in place.** After **APPLY CHANGES** or a config-file edit, `refreshSettingsFromBackend` re-applies all settings and fires `sentinel:config-uploaded`. Anything that reads a setting once must listen for that event. See [Data stores](data-stores.md#a-settings-change).\n\n## Maps\n\nEach map is `MapLibreMap.vue` from `@sentinel/map-kit`. Every map feature (aircraft, vessels, range rings, terrain…) is a MapLibre `IControl` class extending `SentinelControlBase`, in `services/sections/<id>/frontend/src/controls/<feature>/`, or in `map-kit/controls/` when several maps use it. Add a feature as a control, not as code inside a view. Map tiles come from core's offline tile endpoints when off grid (see [Caching](caching.md#offline-map-tiles)).\n\nCanvas maps are invisible to screen readers, so every map has an accessible equivalent: the **FILTER** list.\n\n## Building and testing\n\nEvery package has its own lint, type check and 100% coverage gate, and the shell is built into the committed `frontend/spa-dist/`. The commands, and the two browser test suites, are in [Run tests and quality checks](../development/testing.md); the dev server is in [Set up for development](../development/setup.md#the-dev-loop).\n\n## Screenshots in these docs\n\nThe images in `docs/images/` are taken by a script, never by hand, so they can be retaken whenever the UI changes. `frontend/vue/e2e/docs-screenshots.spec.ts` drives the built app against the e2e suite's mocked API with fixed, fictional data (it is skipped in normal e2e runs). This rebuilds the bundle and retakes every screenshot:\n\n```bash\ncd frontend/vue && npm run build && npm run docs:screenshots\n```\n\nMaps get their background from the online basemap, so the script needs an internet connection. Locally, add `PLAYWRIGHT_CHANNEL=chrome` if Playwright's own browser isn't installed. Commit the new images with the change that altered the UI.\n",Ln=`# Gateway and routing

The gateway is [Caddy](https://caddyserver.com), and it is the only address a browser uses. This page explains how it knows where to send each request, and why nobody edits its configuration when a section is added or moved.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Two kinds of route

**Static routes** live in \`gateway/caddy.json\` and never change at run time:

1. \`/internal/…\` always gets a JSON 404. Internal routes are for services only; the gateway never exposes them.
2. An empty slot, \`registry_routes\`, that core fills in.
3. Everything else goes to core (\`app:8000\`).
4. If Caddy can't reach a service it proxies to, it answers \`503 {"detail": "Service unavailable"}\`.

**Registry routes** are pushed into that empty slot by core, built from what services have registered (\`backend/core/gateway_routes.py\`).

## Route sync

*Figure: How a registration becomes a gateway route, and how the gateway heals itself after a restart.*

\`\`\`mermaid
sequenceDiagram
    participant Service as section service
    participant Registry as core: service registry
    participant Sync as core: gateway sync loop
    participant Caddy as gateway admin API :2019
    Service->>Registry: register manifest (routes: /api/sea/)
    Registry->>Sync: registry.changed (wake now)
    Sync->>Caddy: GET registry_routes
    Caddy-->>Sync: current routes
    Sync->>Sync: build table, longest prefix first
    alt differs
        Sync->>Caddy: PATCH registry_routes
    end
    loop every 10 s
        Sync->>Caddy: GET, compare, PATCH if different
    end
\`\`\`

**In words:**

1. A service registers with core, listing the path prefixes it serves.
2. The registry announces \`registry.changed\`, which wakes core's gateway sync loop at once.
3. The loop reads the routes Caddy currently holds through its admin API (port 2019, reachable only on the compose network).
4. It builds the table the registry says there should be, and replaces Caddy's copy if they differ.
5. Every 10 seconds (\`GATEWAY_SYNC_INTERVAL_S\`) it checks again. A restarted gateway comes back with only its static routes, and the next check fills them in.

Core owns the table; Caddy only holds a copy. With \`GATEWAY_ADMIN_URL\` empty (the test app) there is no gateway and the loop doesn't run.

## Longest prefix wins

Some prefixes sit inside others, so routes are ordered longest first and the first match wins:

| Path | Goes to | Because |
|---|---|---|
| \`/api/air/messages…\` | core | Alerts are core's, kept under the old Air path; core reserves it |
| \`/api/air/…\` | air | |
| \`/api/sdr/adsb/…\` | air | Off-grid ADS-B config belongs to Air |
| \`/api/sdr/radios\`, \`/api/sdr/connect\`, \`/api/sdr/decode/…\`, \`/api/sdr/aprs/…\`, \`/api/sdr/ais/…\`, \`/api/sdr/sentry-hosts\`, \`/api/sdr/decoders\` … | radio | Anything touching a physical radio is the hub's |
| \`/ws/sdr/…\` | radio | The four SDR WebSockets |
| \`/api/sdr/…\` | sdr | Frequencies, groups, search ranges, band plan, recordings |
| \`/api/space/…\`, \`/api/sea/…\`, \`/api/land/…\` | that section | |
| \`/remotes/<id>/…\` | that section | Its UI remote |
| anything else | core | The default route |

A service that core has marked unavailable (three failed health probes) gets a static route answering \`503 {"detail": "<id> is unavailable"}\` instead of a proxy, so requests fail fast. A path whose service never registered matches no registry route and goes to core, which serves the shell's \`index.html\`. A manifest may not claim a prefix another live service holds, or one core reserves.

## Things to know when working on it

- **Streaming works through it.** Caddy flushes server-sent events and proxies WebSockets with no extra settings. Don't add buffering.
- **\`/internal/\` on port 8000 is not protected by the gateway.** If you run a service directly, a GET to \`/internal/…\` falls through to the shell's \`index.html\`. The internal routes themselves check credentials (see [Security](security.md)).
- **Second listener, :8443.** The gateway also serves a TLS **service entrypoint** for services on another machine, such as a radio host. It routes every path, \`/internal/\` included, to core. It is published on \`127.0.0.1\` unless \`SENTINEL_SERVICE_ENTRYPOINT_ADDRESS\` opens it.
`,Rn=`# System overview

This page is the map of Sentinel for a developer: which processes run, how they talk to each other, and how one browser request reaches the code that answers it. The other pages in **How it works** zoom in on each part.

New to a term on these pages, such as core, shell, remote, NATS or SQLite? Each is defined in the [Glossary](../reference/glossary.md).

## The shape of it

Sentinel is a small **core** plus **one service per section**, all built from one backend image, with a Vue single-page app (the **shell**) in the browser.

- **Core** (\`app\` service, \`backend/\`) holds what every section shares: settings, alerts, offline maps, the service registry, and serving the shell.
- **Each section** (\`air\`, \`space\`, \`sea\`, \`land\`, \`sdr\`) is its own FastAPI service, with its own SQLite database and its own piece of UI (a Module Federation **remote**).
- **The radio hub** (\`radio\`) owns everything that touches a physical radio.
- **The gateway** (Caddy) is the only address a browser uses. Core tells it at run time which path goes to which service.
- **NATS** carries low-rate events between the services.
- **Decoders** are optional containers that turn a radio's audio into data.

*Figure: The containers of a full deployment and how they connect. The browser only talks to the gateway; services talk to each other over HTTP and NATS.*

\`\`\`mermaid
flowchart LR
    browser["Browser<br/>(Vue shell + section remotes)"] --> gateway["gateway<br/>Caddy :8080"]
    gateway --> app["app<br/>core"]
    gateway --> sections["air · space · sea · land · sdr<br/>section services"]
    gateway --> radio["radio<br/>radio hub"]
    sections -- "register, settings<br/>(HTTP)" --> app
    radio -- "register, settings<br/>(HTTP)" --> app
    app -- "pushes routes<br/>(admin API :2019)" --> gateway
    app <--> nats(("nats"))
    sections <--> nats
    radio <--> nats
    radio -- "rtl_tcp / Sentry" --> dongles["RTL-SDR dongles"]
    decoders["decoders<br/>voice · aprs · ais · adsb"] -- "config, PCM, events" --> radio
    class gateway accent
    class nats accent
\`\`\`

**In words:**

| Part | Connects to | Over |
|---|---|---|
| Browser | gateway only | HTTP, SSE, WebSockets on :8080 |
| gateway | app, every section, radio hub | HTTP; routes for sections and the hub are pushed by core |
| app (core) | gateway's admin API; NATS | HTTP (:2019, compose network only); NATS |
| Section services | core (registration, settings); NATS | HTTP with their own credential; NATS |
| radio (hub) | core; NATS; the dongles | HTTP; NATS; raw TCP to \`rtl_tcp\`, HTTP to Sentry |
| Decoders | radio hub | HTTP through the gateway for config; TCP for audio |

## One request's journey

*Figure: A browser asks for Sea's vessels. The gateway matches the longest registered prefix and proxies to the Sea service, which reads its own store.*

\`\`\`mermaid
sequenceDiagram
    participant Browser
    participant Gateway as gateway (Caddy)
    participant Sea as sea service
    participant Core as app (core)
    Browser->>Gateway: GET /api/sea/vessels
    Note over Gateway: longest prefix match:<br/>/api/sea/ → sea:8000
    Gateway->>Sea: GET /api/sea/vessels
    Sea-->>Gateway: 200 JSON
    Gateway-->>Browser: 200 JSON
    Browser->>Gateway: GET /api/settings
    Note over Gateway: no registered prefix<br/>→ default route
    Gateway->>Core: GET /api/settings
    Core-->>Browser: 200 JSON (via gateway)
\`\`\`

**In words:**

1. The browser asks the gateway for \`/api/sea/vessels\`.
2. The gateway finds the longest path prefix any service registered (\`/api/sea/\`, registered by Sea) and proxies the request to the Sea service.
3. Sea answers from its in-memory vessel store; the gateway passes the answer back.
4. A path no service registered, such as \`/api/settings\`, goes to core by default.

What happens when a service is down, or never started, is in [Gateway and routing](gateway.md#longest-prefix-wins).

## Where the code lives

| Folder | What it is | More |
|---|---|---|
| \`backend/\` | Core, plus the shared platform every service uses | [Backend code](backend.md) |
| \`services/sections/<id>/backend/\` | One Python package per section, \`sentinel_<id>\` | [Backend code](backend.md) |
| \`services/radio/backend/\` | The radio hub, \`sentinel_radio\` | [Radios and the SDR pipeline](sdr-pipeline.md) |
| \`frontend/vue/\` | The shell SPA | [Frontend](frontend.md) |
| \`services/sections/<id>/frontend/\` | Each section's UI package and remote | [Frontend](frontend.md) |
| \`platform/web/\` | Shared web packages (\`ui\`, \`shell-api\`, \`map-kit\`, \`config\`) | [Frontend](frontend.md) |
| \`gateway/\` | Caddy's static config | [Gateway and routing](gateway.md) |
| \`docker-compose.yml\`, \`backend/Dockerfile\` | Every container, and the image they run | [How Sentinel runs in Docker](docker.md) |
| \`decoder/\` | Decoder containers | [Decoding](decoding.md) |

The decisions behind this layout are in [ADR 0006: section containers](../adr/0006-section-containers.md).
`,zn=`# Radios and the SDR pipeline

This page follows a radio signal from the dongle to the waterfall on screen and the sound in your speakers, then shows how a recording is made. The code is in the radio hub (\`services/radio/backend/sentinel_radio/\`) and the SDR section's frontend (\`services/sections/sdr/frontend/\`).

New to a term on this page? See the [Glossary](../reference/glossary.md).

## The parts

- **rtl_tcp** runs on the computer the dongle is plugged into. It streams the dongle's raw samples over TCP and accepts tuning commands.
- **IQ** is that raw stream: pairs of numbers (I and Q) that describe the signal across the whole band the dongle is receiving. An RTL-SDR sends them as unsigned 8-bit values.
- **The radio hub** keeps one connection to each radio, computes the spectrum, and passes IQ on to whoever needs it.
- **The browser** draws the spectrum and waterfall, and turns IQ into sound itself, in an audio worklet.

## Dongle to screen and speakers

*Figure: The path of one radio's samples, from the dongle to the waterfall and the speakers.*

\`\`\`mermaid
flowchart LR
    dongle["RTL-SDR dongle"] --> rtl["rtl_tcp<br/>(radio computer)"]
    rtl -- "TCP: IQ bytes" --> bc["radio hub:<br/>one broadcaster per radio"]
    bc --> fft["FFT every ~40 ms"]
    fft -- "/ws/sdr/{id}<br/>spectrum frames" --> wf["Browser:<br/>spectrum + waterfall"]
    bc -- "/ws/sdr/{id}/iq<br/>raw IQ" --> worklet["Browser audio worklet:<br/>shift, filter, demodulate"]
    worklet --> speakers["Speakers"]
    wf -- "tune, gain, rate<br/>(same socket)" --> bc
    bc -- "5-byte commands" --> rtl
    class bc accent
\`\`\`

**In words:**

1. \`rtl_tcp\` sends the dongle's IQ samples to the radio hub over one TCP connection.
2. In the hub, **one broadcaster task per radio** reads that connection. Only one task may read it; several WebSocket clients reading the same socket would fail.
3. Every ~40 ms (about 25 frames a second) the broadcaster turns the latest samples into a spectrum with an FFT (1024 to 32768 points) and puts the frame on the queue of every browser watching that radio. Reads are sized by time, not by number of samples, so the frame rate stays steady when the sample rate changes.
4. The browser draws each frame as a line on the spectrum and a row on the waterfall (\`/ws/sdr/{radioId}\`).
5. For sound, the browser opens a second socket for raw IQ (\`/ws/sdr/{radioId}/iq\`). An audio worklet in the browser shifts the chosen frequency to the middle, filters out everything outside the bandwidth, demodulates it (NFM, WFM, AM, USB, LSB or CW) and plays it.
6. Tuning, gain and sample-rate changes go back over the first socket. The hub turns each into a 5-byte \`rtl_tcp\` command: one command byte, then a 4-byte big-endian value.

Two more sockets carry decoder traffic: \`/ws/sdr/{radioId}/decode\` (decoded events and logs) and \`/ws/sdr/{radioId}/decode/audio\` (decoded voice). See [Decoding](decoding.md).

Because demodulation happens in the browser, the audio keeps playing while you move between sections: the SDR engine is mounted outside the page that changes. The worklet's channel filter must always run; skipping it plays the whole band at once.

## Sentry radios

A **Sentry** host shares several dongles. The hub talks to Sentry's HTTP API to list its dongles, claim one, tune it and release it, then streams IQ from that dongle's \`rtl_tcp\` port as above. Sentry hosts are stored in the hub's own \`radio.db\`; the radios themselves are the \`sdr.radios\` setting in core. The design is in [ADR 0003](../adr/0003-sentry-sdr-lock-and-tune.md).

## Making a recording

The WAV comes from the browser, which has the demodulated audio; the raw IQ comes from the hub, which has the samples.

*Figure: Starting and stopping a recording with raw IQ turned on.*

\`\`\`mermaid
sequenceDiagram
    participant Browser
    participant SDR as sdr service
    participant Hub as radio hub
    Browser->>SDR: POST /api/sdr/recordings/start
    SDR->>Hub: start IQ capture for this radio
    Note over Browser: worklet records audio<br/>while the squelch is open
    Note over Hub: writes <id>.u8 in its staging folder
    Browser->>SDR: POST /api/sdr/recordings/stop (WAV upload)
    SDR->>Hub: stop IQ capture
    SDR->>SDR: save <id>.wav, mark IQ pending
    SDR->>Hub: GET /internal/radio-hub/iq-captures/<id>
    Hub-->>SDR: the .u8 file
    SDR->>SDR: save <id>.u8, clear pending
\`\`\`

**In words:**

1. The browser asks the SDR section to start a recording. The SDR section creates the recording's row and, if raw IQ is on, asks the hub to capture IQ.
2. While recording, the browser keeps the demodulated audio (only while the squelch is open) and the hub writes raw IQ to a file in its own staging folder.
3. On stop, the browser uploads the WAV. The SDR section asks the hub to stop the IQ capture and saves the WAV into the recording's folder.
4. In the background, the SDR section fetches the IQ file from the hub over an internal route that only its credential may use, and saves it beside the WAV. Until then the recording shows **COPYING IQ…**.
5. A reconcile loop every 60 seconds retries copies that failed, stops captures nobody stopped, and has the hub discard captures that were never collected.

No volume is shared between the hub and the SDR section, so the hub can run on another machine. Where the files end up is explained in [Record what you hear](../use/sdr/record.md#where-recordings-are-saved); always build a recording's path with \`sentinel_sdr.services.recording_folders\`, never by hand.
`,Bn=`# Security

Sentinel has no user logins: anyone who can reach port 8080 can use it, so run it on a network you trust. This page explains how Sentinel's services prove who they are to each other, what each is allowed to do, and what protects the browser.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Trust boundaries

*Figure: What is reachable from where, and which credential protects each crossing.*

\`\`\`mermaid
flowchart LR
    subgraph lan["Your network"]
        browser["Browser"]
        radiohost["Radio host<br/>(optional second machine)"]
    end
    subgraph compose["Docker network: sentinel"]
        gateway["gateway<br/>:8080 public · :8443 TLS"]
        app["core"]
        services["sections · radio hub"]
        decoders["decoders"]
        nats(("nats<br/>TLS only"))
    end
    browser -- "HTTP :8080<br/>/internal/ refused" --> gateway
    radiohost -- "TLS :8443 + own credential" --> gateway
    radiohost -- "TLS :4222 + own NATS user" --> nats
    gateway --> app
    gateway --> services
    services -- "Bearer credential" --> app
    decoders -- "X-Decode-Secret" --> services
    services -- "own NATS user" --> nats
    app -- "core NATS user" --> nats
    class gateway accent
\`\`\`

**In words:**

| Crossing | Protected by |
|---|---|
| Browser → gateway | Nothing beyond your network. \`/internal/…\` is refused with a 404. |
| Service → core's internal routes | The service's own HTTP credential, as \`Authorization: Bearer\` |
| Decoder → radio hub | The decoder's own credential, in the \`X-Decode-Secret\` header |
| Any process → NATS | TLS with the installation's own certificate authority, and a NATS user per process |
| Radio host → main machine | TLS on :8443 and :4222, plus the radio host's own credentials |

## Where credentials come from

On every \`docker compose up\`, the one-shot \`service-credentials\` service (\`backend/scripts/generate_service_credentials.py\`) makes sure these exist on the \`service_credentials\` volume, creating only what is missing:

- a **certificate authority** for this installation, and TLS certificates for NATS and the gateway's :8443 listener;
- for **every service and decoder**, a random HTTP token (\`credentials/<caller>/http-credentials.json\`) and a NATS login (\`nats-credentials.json\`);
- for core and the radio hub, the list of accepted callers (\`accepted-callers.json\`), holding only each token's **SHA-256 hash**, so neither holds anyone's actual token;
- NATS's \`nats.conf\`, with each user's allowed subjects.

Each container mounts only its own \`credentials/<caller>/\` folder. Nothing is shared and nothing is committed to git. To replace a credential, delete its folder on the volume and run \`docker compose up -d\`.

## What each caller may do

\`backend/platform/service_access.py\` is the table:

| Caller | May |
|---|---|
| \`core\` | Everything (except act as a decoder) |
| \`air\`, \`space\`, \`land\`, \`radio\` | Register itself, under its own id only |
| \`sea\` | Register itself; read and write its own secret, the AISStream key |
| \`sdr\` | Register itself; fetch the hub's staged IQ captures |
| \`voice-decoder\`, \`aprs-decoder\`, \`ais-decoder\`, \`stub-decoder\` | Act as a decoder of its own kind only: read its config, post its events |

The guards are in \`backend/core/internal_auth.py\`:

| Answer | Detail | Means |
|---|---|---|
| 503 | \`Internal service access is disabled on this deployment\` | This process has no accepted-callers list (not under Compose, or \`service-credentials\` didn't run) |
| 401 | \`Invalid service credential\` / \`invalid decode secret\` | The token isn't one it knows: credentials changed but the caller wasn't restarted |
| 403 | \`This service may not do that\` / \`not a <kind> decoder\` | A known caller trying something outside its row |

NATS enforces the same idea for events with its own table, \`backend/platform/nats_permissions.py\` (see [Event bus](event-bus.md#who-may-use-which-subject)).

**A new service or decoder kind** needs a row in both tables and a compose mount of its credentials folder, or it can't authenticate.

## Secrets

The only secret setting today is the AISStream key. The public settings API redacts it and refuses to write it; it is never in \`sentinel_config.json\` or an export. The Sea service reads it from core's \`/internal/settings/secrets/sea/…\`, which only Sea's credential may use. Keys you set in \`.env\` stay on that computer; \`.env\` is git-ignored.

## In the browser

- Core sets a **Content Security Policy** on \`index.html\` (\`backend/core/spa_csp.py\`). Its inline start-up scripts are allowed by a hash worked out from the file on disk. It keeps \`blob:\` and \`'unsafe-eval'\` because SDR audio needs them (a worklet loaded from a blob, and a fallback for plain-HTTP connections on a LAN).
- The shell only loads section remotes from the same origin, under \`/remotes/<id>/\` (see [Frontend](frontend.md#how-the-shell-boots)).
- The docs page renders markdown with HTML turned off, then sanitises it with DOMPurify; Mermaid runs with \`securityLevel: strict\`.

## Inputs

Every backend route validates its input with Pydantic models and bounds (for example, a recordings folder must be a relative subfolder that stays inside the recordings root, and a service manifest's route prefixes must match a strict pattern). Database queries go through SQLAlchemy, never string-built SQL from user input. When you add a route, validate every field at the edge and add a test that proves bad input is refused.
`,Vn=`# Services and start-up

This page follows a section service from \`docker compose up\` to serving requests, and explains what happens when one stops or is never started.

New to a term on this page? See the [Glossary](../reference/glossary.md).

## Start-up and registration

\`docker compose up\` starts the sections at the same time as core, often before core is ready. Each section therefore waits for core before doing anything that needs settings, and only asks to be routed to once it is fully started.

*Figure: A section service starting up, from waiting for core to its first routed request.*

\`\`\`mermaid
sequenceDiagram
    participant Sea as sea service
    participant Core as app (core)
    participant NATS as nats
    participant Gateway as gateway
    Sea->>Core: GET settings (retry until it answers)
    Note over Sea: logs "waiting for core to answer"
    Core-->>Sea: 200
    Note over Sea: logs "connected to core at …"
    Sea->>NATS: connect as user "sea"
    Note over Sea: prepare(): tables, legacy import<br/>start(): AIS reader, receiver
    Sea->>Core: POST /internal/registry/register (manifest, Bearer credential)
    Core->>Core: validate, store, publish registry.changed
    Core->>Gateway: PATCH routes: /api/sea/, /remotes/sea/ → sea:8000
    loop every 10 s
        Core->>Sea: GET /health
    end
\`\`\`

**In words:**

1. The section asks core for its settings (they are stored by core, not by the section), retrying quietly until core answers. While it waits it logs \`<id> service startup: waiting for core to answer (…)\`, then \`… connected to core at <url>\`.
2. It connects to NATS as its own user.
3. It runs its own \`prepare\` (tables, and on first boot a one-off copy of its tables from the old single database) and \`start\` (its background work).
4. It registers its **manifest** with core: its id, kind, address and the path prefixes it serves. The request carries the service's own credential.
5. Core validates the manifest, stores it in memory, and announces \`registry.changed\`.
6. Core's gateway sync pushes the new routes into Caddy, so \`/api/sea/\` and \`/remotes/sea/\` now reach the Sea service.
7. Core probes \`GET /health\` on the service every 10 seconds from then on.

The registry is held only in memory. A service re-registers on an interval, so a restarted core learns every running service again within seconds.

## Which sections the browser sees

\`GET /api/app/sections\` (\`backend/core/app_sections.py\`) lists the registered sections that have a built UI remote. The shell loads exactly those (see [Frontend](frontend.md#how-the-shell-boots)). A section that never registered doesn't appear anywhere.

## When a service stops

*Figure: What the registry and gateway do when a registered service stops answering, and when it comes back.*

\`\`\`mermaid
flowchart TD
    probe["Health probe every 10 s"] --> ok{"Answered?"}
    ok -- "Yes" --> available["Available:<br/>gateway proxies to it"]
    ok -- "No, 3 times in a row" --> unavailable["Unavailable"]
    unavailable --> changed["registry.changed"]
    changed --> gw["Gateway route answers<br/>503 without dialling"]
    changed --> ui["Shell greys out its<br/>menu entry"]
    unavailable --> probe
    class unavailable accent
\`\`\`

**In words:**

1. Core probes every registered service's \`/health\` every 10 seconds (\`REGISTRY_PROBE_INTERVAL_S\`).
2. After three failures in a row (\`REGISTRY_PROBE_FAILURES\`), the service is marked unavailable and \`registry.changed\` is announced.
3. Its gateway route is replaced with a static 503, so requests fail fast instead of waiting on a dead address ([Gateway and routing](gateway.md#longest-prefix-wins)).
4. The shell greys out its menu entry and shows "<label> is unavailable" on its page. The other sections keep working.
5. Probes continue; the first good probe makes it available again.

Liveness is checked over HTTP only, never over NATS, so restarting the broker can't grey out healthy sections.

## What each service needs

| Service | Waits for | Needs NATS for |
|---|---|---|
| \`space\` | core | settings change events |
| \`air\` | core | Sentry reservations from the hub, squawk alerts to core |
| \`sea\` | core | off-grid AIS events from the hub, starting and stopping its receiver |
| \`land\` | core | APRS packets from the hub |
| \`sdr\` | core | IQ capture hand-over from the hub |
| \`radio\` | core | decode events out, requests from sections in |

The operator's view of the same thing (log lines of a healthy start, what to check when a section is missing) is in [Check logs, health and backups](../operations.md#a-healthy-start).
`,Hn="# Environment variables (.env)\n\n`.env` holds the settings about **how Sentinel runs on this computer**: which optional containers start, where files are saved, and how a second computer connects. Everything you change while using Sentinel (your location, radios, map look) is in Settings and the [config file](use/config-file.md) instead.\n\nYou don't need a `.env` at all: every variable has a working default.\n\n## How it works\n\n- `.env` sits in the folder you installed Sentinel in, next to `docker-compose.yml`. `cp .env.example .env` gives you one with every variable listed and commented out.\n- Docker Compose reads it when you run a `docker compose` command, and passes the variables below to the containers that need them.\n- After changing it, run `docker compose up -d`. Compose restarts only the containers the change affects.\n- **Never commit it.** It can hold keys, so it is listed in `.gitignore`.\n\n[`.env.example`](../.env.example) is the full list, with a comment on each variable. This page groups them by what you'd want to do.\n\n## Choose what starts\n\n| Variable | Default | Set it when |\n|---|---|---|\n| `COMPOSE_PROFILES` | none | You want decoders to start with a plain `docker compose up`. `all` for every decoder, or a list such as `aprs,ais`. It applies to every compose command, including `down` and `logs`. See [Install and run decoders](decoders.md). |\n| `SENTINEL_RADIO_REPLICAS` | `1` | The radio hub runs on [a second computer](radio-host.md). Set it to `0` so this one doesn't start its own. |\n\nTo leave out a section instead, see [Quick start](install.md#start-some-sections).\n\n## Choose where files go\n\n| Variable | Default | Set it when |\n|---|---|---|\n| `SENTINEL_RECORDINGS_DIRECTORY` | the `sdr_recordings` Docker volume | You want SDR recordings in a folder on this computer, such as `~/SentinelRecordings`, to open them in other software or back them up. Then run `docker compose up -d sdr`. See [Record what you hear](use/sdr/record.md#where-recordings-are-saved). |\n| `SENTINEL_RUNTIME_USER_ID` / `SENTINEL_RUNTIME_GROUP_ID` | `1000` / `1000` | You're on Linux and your user isn't 1000 (check with `id -u` and `id -g`). Sentinel's containers run as this user, so set them to your own ids, or Sentinel can't save the config file and your recordings belong to someone else. |\n\n## Data sources\n\n| Variable | Default | Set it when |\n|---|---|---|\n| `AISSTREAM_API_KEY` | empty | You'd rather install the AISStream key than type it into **Settings › SEA › AIS Data API Key**. A key saved in Settings wins. See [Sea](use/sea.md#add-your-aisstream-key). |\n| `ADSB_OFFGRID_URL` | the `adsb-decoder` container | The ADS-B decoder runs somewhere other than this computer's Docker, for example `http://<decoder-host>:8090/data/aircraft.json`. |\n| `OFFLINE_BASEMAP_SOURCE_URL` | empty: the newest Protomaps world build, found automatically | You want map downloads cut from one particular build, such as a copy you host yourself. Protomaps deletes each dated build after about a week, so don't point it at one of theirs. |\n| `OFFLINE_TERRAIN_SOURCE_URL` | Mapterhorn's world terrain | You want terrain downloads from another Terrarium-format `.pmtiles` archive. |\n\n## The ADS-B decoder\n\nThese only matter when the `adsb` profile runs.\n\n| Variable | Default | Set it when |\n|---|---|---|\n| `SENTINEL_ADSB_DECODER_ADDRESS` | `127.0.0.1:8090` | Another computer reads the decoded aircraft. `0.0.0.0:8090` opens it to your network. It has no password, so only do this on a network you trust. |\n| `SENTINEL_ADSB_RTL_TCP_HOST` / `SENTINEL_ADSB_RTL_TCP_PORT` | empty / `2345` | You run the decoder before choosing a dongle in **Settings › AIR › Off Grid ADS-B SDR**. Normally the decoder asks Sentinel which dongle to use. |\n| `SENTINEL_ADSB_SENTRY_API` | empty: no check | You use a Sentry host: set it to that host, such as `http://<sentry-host>:8000`. At start, the decoder asks it what the dongle is tuned to and logs the answer, so a dongle on the wrong frequency shows in the log instead of as an empty map. |\n\n## Decoders outside Docker\n\n| Variable | Default | Set it when |\n|---|---|---|\n| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | A decoder runs outside this computer's Docker network: set it to `http://<sentinel-host>:8080`. Decoders reach the radio hub through the gateway, so they find it wherever it runs. |\n\n## A second computer\n\nThese are only for running the radio hub on [a second computer](radio-host.md). That page says which to set on which computer, with the values.\n\n| Variable | What it does |\n|---|---|\n| `SENTINEL_CORE_HOSTNAMES` | The names or addresses the radio host reaches the main computer by. Sentinel's certificates cover them. |\n| `SENTINEL_RADIO_HOST_HOSTNAMES` | The name the main computer reaches the radio host by. Sentinel issues the radio host's certificate for it. |\n| `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` | Where the TLS service entrypoint is published. Default `127.0.0.1:8443`, this computer only. |\n| `NATS_PUBLISHED_ADDRESS` | Where the event bus is published. Default `127.0.0.1:4222`, this computer only. |\n| `SENTINEL_CORE_ENTRYPOINT_URL`, `SENTINEL_CORE_NATS_URL`, `SENTINEL_RADIO_HOST_URL`, `SENTINEL_RADIO_HOST_GATEWAY_ADDRESS` | Set on the radio host: where it reaches the main computer, and where the main computer reaches it. |\n\n## Leave these alone\n\n`NATS_URL` (the event bus) and `GATEWAY_ADMIN_URL` (the gateway's admin API) connect Sentinel's own containers. Compose sets them; changing them breaks the connection between services.\n\n## Everything else\n\nSentinel has more settings with built-in defaults (developers: `backend/config.py`): cache times, the addresses of the online sources (adsb.lol, CelesTrak, ukrepeater.net), timeouts and decoder ports. You rarely need them.\n\nCompose passes only the variables on this page from `.env` to the containers, so putting one of these in `.env` does nothing. To change one, put it in a **compose override file**: a file called `docker-compose.override.yml` next to `docker-compose.yml`, which Compose reads automatically. Set the variable on the service that uses it, in upper case. For example, to keep ADS-B data fresh for 5 seconds instead of 10:\n\n```yaml\nservices:\n  air:\n    environment:\n      ADSB_TTL_MS: \"5000\"\n```\n\nThen run `docker compose up -d`. Check what a service will receive with `docker compose config air`. The override file is yours; Git ignores it.\n\n## Example .env files\n\n**Everything on one computer, recordings in your home folder, decoders always on:**\n\n```bash\n# Start every decoder with a plain `docker compose up`.\nCOMPOSE_PROFILES=all\n\n# Save SDR recordings to a folder on this computer instead of a Docker volume.\nSENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings\n\n# Linux only: run as your own user so the recording files are yours (id -u / id -g).\nSENTINEL_RUNTIME_USER_ID=1000\nSENTINEL_RUNTIME_GROUP_ID=1000\n```\n\n**An AISStream key set when installing, rather than in Settings:**\n\n```bash\nAISSTREAM_API_KEY=<your-aisstream-key>\n```\n",Un="# Install and run decoders\n\nThis page is about installing and running the decoder containers. To use a decoder once it runs, see [Decode digital signals](use/sdr/decode.md). To see how decoding works inside Sentinel, see [Decoding](architecture/decoding.md).\n\nA **decoder** turns a digital radio signal into something Sentinel can show or play. Each one is an optional container in its own [compose profile](reference/glossary.md#developer-terms) (a named group of optional containers), so it starts only when you ask for it.\n\n| Decoder | Profile | What you get | Program inside |\n|---|---|---|---|\n| Digital voice | `voice-decoder` | DMR, P25, NXDN, D-STAR, YSF and M17 voice and call details in the SDR panel | dsd-fme |\n| APRS | `aprs` | APRS stations on the Land map | Direwolf |\n| AIS | `ais` | Ships on the Sea map with no internet | Direwolf 1.8 |\n| ADS-B | `adsb` | Aircraft on the Air map with no internet | readsb |\n\n## Before you start\n\n- **One dongle per decoder.** Each decoder holds its own connection to its dongle and tunes it, so they can't share. `--profile all` means four dongles. What to buy is in [Choose radios and hardware](hardware.md).\n- **A radio added to Sentinel** for each decoder ([Add a radio](use/sdr/add-a-radio.md)). For ADS-B it must be a Sentry dongle.\n- **Time for the first build.** Building every decoder takes several minutes the first time, because the voice decoder compiles its vocoder library and the AIS decoder compiles Direwolf.\n\nDecoders need no passwords or keys: Sentinel gives each one its own login when it starts.\n\n## Start decoders\n\nStart the ones you want:\n\n```bash\ndocker compose --profile aprs up -d --build                         # one\ndocker compose --profile aprs --profile ais up -d --build           # several\ndocker compose --profile all up -d --build                          # all four\n```\n\nThe profile names are `voice-decoder`, `aprs`, `ais` and `adsb`.\n\nEach decoder logs one line when it reaches the radio hub. Check it with:\n\n```bash\ndocker compose --profile all logs aprs-decoder\n```\n\nYou should see `[aprs] connected to the radio hub through http://gateway:8080`. If the hub is still starting, you'll first see one `waiting for the radio hub through …; retrying quietly`.\n\n## Start them every time\n\nA decoder started with `--profile` is left out the next time you run a plain `docker compose up -d`. To start decoders every time, set them in `.env`:\n\n```bash\nCOMPOSE_PROFILES=aprs,ais        # or all\n```\n\nThis applies to every compose command, including `down` and `logs`, so you no longer need `--profile`. See [Environment variables](configuration.md#choose-what-starts).\n\n## Give each decoder its radio\n\nOnce a decoder runs, tell Sentinel which radio it uses: **Off Grid APRS SDR** in Settings › LAND, **Off Grid AIS SDR** in Settings › SEA, **Off Grid ADS-B SDR** in Settings › AIR, or the **DMR** button in the SDR panel for digital voice. What each one then does is in [Decode digital signals](use/sdr/decode.md).\n\n## Update or rebuild a decoder\n\nAfter an upgrade, rebuild only the decoders, without restarting the rest of Sentinel:\n\n```bash\ndocker compose up -d --build --no-deps aprs-decoder ais-decoder\n```\n\nWithout `--no-deps`, `--build` rebuilds and restarts the app too, and for a few seconds the sections log errors for requests that needed it.\n\n## Stop decoders\n\nStop one, and leave the rest of Sentinel running:\n\n```bash\ndocker compose stop aprs-decoder\n```\n\nIt starts again with the next `docker compose --profile aprs up -d`, or with every `docker compose up -d` if `COMPOSE_PROFILES` names it; remove it from `COMPOSE_PROFILES` to keep it stopped.\n\n## On a second computer\n\nThe radio hub and the voice, APRS and AIS decoders can run on a computer next to the antennas, while the browser keeps using this one. See [Run the radios on a second machine](radio-host.md). The ADS-B decoder stays on the main computer.\n\nA decoder you run outside Docker, or on a computer of its own, needs `SENTINEL_GATEWAY_URL` set to `http://<sentinel-host>:8080`. Off-grid Air then needs `ADSB_OFFGRID_URL`; see [Environment variables](configuration.md#data-sources).\n\n## Troubleshooting\n\nThese are problems with the decoder containers themselves. If a decoder runs but its map stays empty, see that section's page: [Air](use/air.md#troubleshooting), [Sea](use/sea.md#troubleshooting) or [Land](use/land.md#troubleshooting).\n\n| What you see | What to do |\n|---|---|\n| The decoder log repeats `waiting for the radio hub` | The radio hub isn't running: `docker compose ps radio`. |\n| `decode-config fetch failed: HTTP Error 401` on every poll | The decoder's login is out of date, usually after credentials were recreated. Restart it, for example `docker compose restart aprs-decoder`. |\n| ADS-B log: `no ADS-B source configured` | No dongle is chosen in **Off Grid ADS-B SDR**, or the chosen one no longer appears on the Sentry host (unplugged, or its id changed). Choose it again. |\n| A radio reads **RESERVED** in the SDR panel | A decoder holds it. That is on purpose, so the decoder isn't knocked off its channel. |\n\n## For developers\n\nMore on each decoder's container: [`decoder/README.md`](../decoder/README.md) (voice), [`decoder/aprs/README.md`](../decoder/aprs/README.md), [`decoder/ais/README.md`](../decoder/ais/README.md), [`decoder/adsb/README.md`](../decoder/adsb/README.md).\n\n**Never push the decoder images to a public registry.** The voice decoder's image includes a patent-encumbered library (mbelib), so it is built on the computer that uses it.\n",Wn="# Find your way around the code\n\nEvery top-level folder, what is in it, and where to go to change something. How the parts work together is in [System overview](../architecture/overview.md).\n\n## Where to go to change…\n\n| To change | Go to |\n|---|---|\n| What a section shows or does in the browser | `services/sections/<id>/frontend/src/` |\n| A map feature (a layer, a button on the map) | `services/sections/<id>/frontend/src/controls/<feature>/`, or `platform/web/map-kit/src/controls/` if several maps share it |\n| A section's API or background work | `services/sections/<id>/backend/sentinel_<id>/` |\n| Anything that talks to a radio: tuning, the waterfall, audio, decoding | `services/radio/backend/sentinel_radio/` |\n| Settings storage, the config file, alerts, offline maps | `backend/core/`, `backend/routers/`, `backend/services/` |\n| The page frame: menu, sidebar, Settings panel, alerts bell | `frontend/vue/src/` |\n| A button, field or panel used in many places | `platform/web/ui/src/` |\n| A setting's default value | `backend/default_config.json` |\n| Which containers run, their ports and volumes | `docker-compose.yml` |\n| A decoder | `decoder/<kind>/` |\n| These docs | `docs/`, and `docs/nav.json` for the menu |\n\n## Top level\n\n| Folder or file | What it is |\n|---|---|\n| `backend/` | Core (the `app` service) and the shared Python platform every service is built on. Also the backend's `pyproject.toml`, its lockfile and the one `Dockerfile` every Python service runs from. |\n| `services/sections/<id>/` | One folder per section (`air`, `space`, `sea`, `land`, `sdr`), each with a `backend/` and a `frontend/`. |\n| `services/radio/backend/` | The radio hub. It has no frontend: the radio panels are the SDR section's. |\n| `frontend/vue/` | The shell: the Vue app that loads in the browser and hosts every section. |\n| `frontend/spa-dist/` | The built app, **committed**, because it is what Sentinel serves. Rebuild it with `cd frontend/vue && npm run build`. |\n| `frontend/assets/` | Map tiles, sprites and fonts the maps use offline. |\n| `frontend/scripts/` | The script that generates the light map style from the dark one. |\n| `platform/web/` | Shared frontend packages (see below). |\n| `decoder/` | The decoder containers: voice in `decoder/` itself, then `aprs/`, `ais/`, `adsb/` and `stub/`. |\n| `gateway/` | Caddy's static config: `caddy.json` for the main computer, `radio-host-caddy.json` for a radio host. |\n| `tests/` | Backend tests (`tests/backend/`), the full-stack browser tests (`tests/e2e/`) and the all-in-one app the backend tests run (`in_process_app.py`). Each section's own backend tests are in its `backend/tests/`. |\n| `scripts/` | Repo tooling: the docs link check and the script that runs a command in every web package. |\n| `docs/` | These docs. `docs/plans/` holds working design notes and isn't shown in the app. |\n| `.github/workflows/` | CI (`ci.yml`) and the changelog job (`changelog.yml`). |\n| `docker-compose.yml` | Every container on the main computer. |\n| `compose.radio-host.yaml` | The containers on a [radio host](../radio-host.md). |\n| `docker-bake.hcl` | Builds images for several kinds of computer at once. |\n| `conftest.py`, `pytest.ini` | Backend test set-up. |\n| `package.json` | The npm workspace root: one install for every frontend package, plus root tooling. |\n| `CLAUDE.md` | Notes for the AI assistant; much of it is the same ground as these docs, in short form. |\n| `CHANGELOG.md` | Written automatically from commit messages. Don't edit it. |\n\n## Inside `backend/`\n\n| Folder | What it is |\n|---|---|\n| `backend/core/` | What only core does: the service registry, gateway sync, alerts, serving the shell, internal sign-in checks. |\n| `backend/platform/` | What every service shares: the event bus, settings client, lifecycles, credentials, TLS. `backend/platform/sdk/` builds a section service. |\n| `backend/modules/` | Core's own lifecycles (`bus`, `core`). |\n| `backend/routers/` | Core's HTTP routes: settings, offline maps. |\n| `backend/services/` | Core's work: the config file, offline map downloads. |\n| `backend/data/` | Starting data (band plan, satellite frequencies, UK repeaters) and, at run time, `sentinel_config.json`. |\n| `backend/scripts/` | One-off and maintenance scripts, such as creating credentials and refreshing the repeater list. |\n| `backend/main.py` | Core's entry point. |\n| `backend/config.py` | Every backend setting with its default. |\n\n## Inside a section\n\nEach section follows the same layout. For `sea`:\n\n| Path | What it is |\n|---|---|\n| `backend/sentinel_sea/router.py` | Its HTTP routes |\n| `backend/sentinel_sea/services/` | Its work: feeds, stores, background loops |\n| `backend/sentinel_sea/models.py`, `database.py` | Its tables, and how they are created and seeded |\n| `backend/sentinel_sea/module.py` | Its lifecycle and its manifest (the paths it serves) |\n| `backend/sentinel_sea/service.py` | The service's entry point |\n| `backend/tests/` | Its backend tests |\n| `frontend/src/section.ts` | How it registers with the shell: menu entry, route, settings, sidebar |\n| `frontend/src/SeaView.vue` and the other components beside it | Its page and panels |\n| `frontend/src/controls/`, `stores/`, `settings/`, `settings.ts` | Its map controls, state, and settings rows |\n\n## Shared frontend packages\n\n| Package | Folder | What it is |\n|---|---|---|\n| `@sentinel/ui` | `platform/web/ui/` | Buttons, fields, panels, icons. Depends on nothing but Vue. |\n| `@sentinel/shell-api` | `platform/web/shell-api/` | What the shell offers sections: registries, capabilities, the shared stores and the settings kit. |\n| `@sentinel/map-kit` | `platform/web/map-kit/` | The map component, shared map controls and map helpers. |\n| `@sentinel/web-config` | `platform/web/config/` | Shared TypeScript, lint, format and test config. |\n\n`ui`, `shell-api` and `map-kit` each depend only on the ones before them, and no package imports a section. A section imports only these packages and its own files. Lint enforces both. More in [Frontend](../architecture/frontend.md).\n",Gn="# How to…\n\nShort recipes for the changes people make most often. Each one lists every file to touch and links to the page that explains why. The recipes don't cover tests; the standard every change must meet is in [Run tests and quality checks](testing.md).\n\n## Add a setting\n\n1. **Give it a default** in `backend/default_config.json`, under its section's namespace. That seeds the database on first start and fixes the key's place in the config file; without it the setting is missing from `sentinel_config.json` until someone first saves it.\n2. **Add its row** to the section's `frontend/src/settings.ts` with `registerSettingItems`: a `label` exactly as the UI should show it, a `desc`, `searchTerms` for Settings search, and a `control`.\n3. **Build the control** from the settings kit in `@sentinel/shell-api/settings/` (`BaseToggleSetting`, `BaseNumberSetting`, `useStagedSetting` and others). The control must **stage** its change and save only on **APPLY CHANGES**; a control that saves at once leaves APPLY CHANGES saying \"NO CHANGES\", which looks broken.\n4. **Apply it to the section's state** when settings load: register a hydrator with `registerSettingsHydrator` (`@sentinel/shell-api/shell/settingsHydration`), as Air and Land do in their `section.ts`.\n5. **Read it again on `sentinel:config-uploaded`** anywhere it is read once (on mount, at start). APPLY CHANGES and config-file edits refresh settings in place, with no page reload, so a value read once goes stale.\n6. **On the backend**, read it through the settings client (`backend/platform/settings_client.py`), never from the `user_settings` table: settings belong to core. See [Data stores](../architecture/data-stores.md#settings-belong-to-core).\n7. **If it is a secret** (a key or password), add it to `SECRET_SETTING_KEYS` in `backend/services/app_config.py`, so it is never shown, exported or written to the config file, and give the service that needs it access in `backend/platform/service_access.py`. See [Security](../architecture/security.md#secrets).\n8. **Document it** in that section's page under **Settings**, in `docs/use/`.\n\n## Add an API route to a section\n\nAdd it to the section's `router.py`. If it starts with a path prefix the section doesn't serve yet, add the prefix to the manifest's `routes` in `module.py`; the gateway picks it up when the service next registers. See [Backend code](../architecture/backend.md#adding-to-the-backend) and [Gateway and routing](../architecture/gateway.md#longest-prefix-wins).\n\n## Add a map control\n\nMap features are controls, not code inside a view. Make a folder `services/sections/<id>/frontend/src/controls/<feature>/` with a class that extends `SentinelControlBase` from `@sentinel/map-kit`, and add the control in the section's map component. If several sections' maps need it, put it in `platform/web/map-kit/src/controls/` instead.\n\nA map is opaque to screen readers, so give the control an accessible name and keyboard operation, and make sure what it shows can also be reached as text. Every font a map layer uses must have its glyphs bundled under `frontend/assets/fonts/`, because maps work offline.\n\n## Add an event-bus subject\n\nPublish or subscribe in code, then add the subject to `backend/platform/nats_permissions.py` and restart `nats`. Without the entry the broker refuses it. The steps are in [Event bus](../architecture/event-bus.md#adding-a-subject).\n\n## Add a decoder kind\n\nA new decoder needs no radio hub code: it registers a manifest and the hub runs a bridge for it. You do need a row in `service_access.py`, a compose service with its credentials mounted, and somewhere for its events to go. The steps are in [Decoding](../architecture/decoding.md#adding-a-new-decoder-kind); `decoder/stub/` is a working template.\n\n## Add a section\n\nA section touches many files, so copy the smallest existing one (Space) and change its names. Then wire it in at each of these places. `git grep -n sentinel_space` and `git grep -n section-space` find every one:\n\n| Where | What to add |\n|---|---|\n| `services/sections/<id>/backend/` | The package `sentinel_<id>`: `router.py`, `services/`, `models.py`, `database.py`, `module.py` (lifecycle and manifest), `service.py`, and `tests/` |\n| `services/sections/<id>/frontend/` | The package `@sentinel/section-<id>`, with `src/section.ts` registering it with the shell |\n| `backend/pyproject.toml` | The package as a dependency and a path source; its name in import-linter's `root_packages` and in each contract |\n| `backend/Dockerfile` | A `COPY` of its `pyproject.toml` (for the lockfile check) and of its folder |\n| `docker-compose.yml` | Its service, on the shared section anchors, with its own data volume, a live-reload mount of its backend folder and a mount of `credentials/<id>/` |\n| `backend/platform/service_access.py` | A row, so it can register |\n| `backend/platform/nats_permissions.py` | A row for its NATS user, with the subjects it uses |\n| `conftest.py` | An import of its models |\n| `tests/in_process_app.py` | Its router, lifecycle and manifest, so the backend tests cover it |\n| `frontend/vue/package.json` | The section package as a dependency |\n| `frontend/vue/src/shell/sections.ts` | An entry, in menu order |\n| `.github/workflows/ci.yml` | The service in the full-stack smoke job's list |\n| `docs/use/<id>.md` and `docs/nav.json` | Its user page, in the standard layout |\n\nThen run `uv lock --project backend` and `npm install` from the root, and rebuild the image. Why sections are built this way is in [ADR 0006](../adr/0006-section-containers.md).\n\n## Ship a frontend change\n\nWhat Sentinel serves is the committed `frontend/spa-dist/`, so a frontend change isn't live until it is rebuilt and committed:\n\n1. `cd frontend/vue && npm run build`\n2. Run the e2e suite, which tests that build: `npm run test:e2e`.\n3. Commit `frontend/spa-dist/` in its own commit, after the change itself (for example `build(spa): rebuild the bundle with …`).\n\n## Add or change a docs page\n\n1. Write the page in `docs/`, in the style of the pages around it. A page about using a section follows the layout in [Air](../use/air.md): what it's for, start it, before you start, using it, off grid, settings, troubleshooting.\n2. Add it to `docs/nav.json`, or it has no place in the menu.\n3. Run `npm run check:doc-links`. It fails on a link to a missing page or heading.\n4. Rebuild and commit `frontend/spa-dist/`, because the docs are bundled into the app. For the running stack to show it, run `docker compose up --build -d`.\n\nScreenshots come from a script; see [Frontend](../architecture/frontend.md#screenshots-in-these-docs).\n",Kn=`# Set up for development

Use this page to go from a fresh clone to editing Sentinel with live reload. Branches, commits and pull requests are in [Contributing](../../CONTRIBUTING.md); tests and checks are in [Run tests and quality checks](testing.md).

## Before you start

| Tool | Version | Used for |
|---|---|---|
| Docker with Docker Compose | recent | Running Sentinel. Every service runs in a container, even while you develop. |
| [nvm](https://github.com/nvm-sh/nvm) and Node.js | Node 24 or 25 with npm 11 (\`.nvmrc\` says 24) | The frontend and its tests |
| [uv](https://docs.astral.sh/uv/) | recent | The backend's Python (3.12 or newer), its packages and its tests |
| Git | recent | — |

You don't need Python or pytest installed globally: uv manages them. Run every \`uv\` command from the repo root with \`--project backend\` (see [Two rules that save time](#two-rules-that-save-time)).

## First-time set-up

1. Clone the repo and enter it:

   \`\`\`bash
   git clone https://github.com/barrygee/Sentinel.git
   cd Sentinel
   \`\`\`

2. Switch to the pinned Node version, then install every frontend package. This also installs the pre-commit hook:

   \`\`\`bash
   nvm use
   npm ci
   \`\`\`

   An install under the wrong Node or npm version fails with \`EBADENGINE\` on purpose, so the lockfile always matches CI.

3. Install the backend's packages on your computer. Sentinel itself runs in Docker; this local copy is for the backend tests, lint and your editor:

   \`\`\`bash
   uv sync --project backend
   \`\`\`

4. Start Sentinel:

   \`\`\`bash
   docker compose up --build -d
   \`\`\`

   Open **http://localhost:8080** and check it works. No keys or passwords are needed.

## The dev loop

The containers are set up for development: your code is mounted into them, so you don't rebuild images while you work.

**Backend.** Every Python service runs with live reload. Save a \`.py\` file under \`backend/\` or \`services/*/backend/\` and that service restarts itself in a second or two. Watch it with \`docker compose logs -f <service>\`.

**Frontend.** Run the Vite dev server in a second terminal and open **http://localhost:5173**:

\`\`\`bash
cd frontend/vue && npm run dev
\`\`\`

Vite serves the shell and every section package with hot reload (changes appear without a page reload), and passes API and WebSocket calls through to the stack on :8080.

**What :8080 serves** is the built app in \`frontend/spa-dist/\`, which is committed. To see a frontend change there, or to ship one, rebuild it and commit the result:

\`\`\`bash
cd frontend/vue && npm run build
\`\`\`

Then reload the browser; no restart is needed. The docs are bundled into the app too, so a docs change needs the same rebuild.

**Rebuild the images** (\`docker compose up --build -d\`) only when dependencies change (\`pyproject.toml\`, \`package.json\`).

How all of this is wired is in [How Sentinel runs in Docker](../architecture/docker.md#how-your-edits-reach-the-running-app).

## Run one section while developing

To work on one section with less running, start core with only that section:

\`\`\`bash
docker compose up -d gateway sea          # core and Sea
docker compose up -d gateway sdr radio    # SDR needs the radio hub for live radios
\`\`\`

Its code reloads live as usual. The shell shows only the sections that are running.

To stop one service while you test how the rest behave without it: \`docker compose stop sea\`. Start it again with \`docker compose up -d sea\`.

## Two rules that save time

- **The app is \`frontend/vue/\` and the section packages.** The root \`package.json\` is the workspace root and holds repo-wide tooling (lint for config files, the full-stack browser tests, the pre-commit hook). It is not the app. Install from the root (\`npm ci\`); add a package to the app with \`npm install <package> -w frontend/vue\`.
- **Run \`uv\` from the repo root with \`--project backend\`.** The backend's \`pyproject.toml\` is in \`backend/\`, so a bare \`uv run\` from the root finds the wrong Python. If pytest says \`Missing required plugins: pytest-asyncio\`, it is running outside the backend's environment: fix the command, don't install the plugin globally.

## Your editor

Turn on format-on-save with Prettier for TypeScript and Vue, and ruff for Python, using the repo's config. The pre-commit hook formats and lints staged files anyway, but saving formatted saves a round trip.

## Next

- [Find your way around the code](code-map.md)
- [Run tests and quality checks](testing.md)
- [How to…](how-to.md) add a setting, a section, a decoder or a map control
`,qn=`# Run tests and quality checks

CI runs every check on this page on each pull request and on every push to \`main\`, and all of them must pass. Run them yourself before you push, so the pull request goes green first time. The pre-commit hook formats and lints the files you stage, but it doesn't run tests or type checks.

Run each command from the repo root unless it starts with \`cd\`.

## Backend

\`\`\`bash
uv run --project backend ruff check backend services/sections services/radio           # lint
uv run --project backend ruff format --check backend services/sections services/radio  # formatting
PYTHONPATH=. uv run --project backend lint-imports --config backend/pyproject.toml     # import boundaries
uv run --project backend pytest                                                        # tests
uv run --project backend pytest tests/backend/test_routers_air.py::test_name           # one test
\`\`\`

- **Fix formatting** with \`uv run --project backend ruff format backend services/sections services/radio\`. ruff is the only Python formatter; its lint rules are deliberately few (\`E,F,I,UP,B\`).
- **Import boundaries** keep the sections apart: no part of \`backend\` may import a section, and no section may import another. Sections talk over the [event bus](../architecture/event-bus.md) instead.
- **The tests need no Docker.** They run one all-in-one app, \`tests/in_process_app.py\`: core given every section's and the radio hub's routes, lifecycles and manifests, in a fixed order that the parity tests check. No deployment runs it. A new section must be added there, or its routes go untested.
- **Tests ignore your \`.env\`.** The root \`conftest.py\` loads settings without it, so a live \`.env\` can't change the results. Each test gets an in-memory database.
- **Format a single file**, such as a new test, with \`uv run --project backend ruff format --config backend/pyproject.toml <file>\`. A bare \`ruff format\` from the root uses a different line length.
- **mypy is informational**, not a gate: \`uv run --project backend mypy backend\` shows about 90 known errors.

## The app (\`frontend/vue/\`)

\`\`\`bash
cd frontend/vue
npm run lint             # ESLint and Prettier
npm run typecheck        # vue-tsc
npm run test:coverage    # Vitest, 100% coverage
npm run build            # production build (writes frontend/spa-dist/)
npm run test:e2e         # browser tests over the built app
\`\`\`

\`npm run lint:fix\` and \`npm run format\` fix what they can.

## Shared and section packages

\`\`\`bash
npm run web-packages -- lint            # every package in platform/web/ and services/sections/*/frontend/
npm run web-packages -- typecheck
npm run web-packages -- test:coverage   # 100% coverage, per package
cd services/sections/sdr/frontend && npm run test:coverage   # one package
\`\`\`

A section package may import only \`@sentinel/ui\`, \`@sentinel/shell-api\`, \`@sentinel/map-kit\` and itself. The \`noSectionImports\` lint rule fails the build otherwise. Only \`frontend/vue/src/shell/sections.ts\` and app specs may import a section.

## Repo tooling

\`\`\`bash
npm run lint               # ESLint and Prettier over root config files and tests/e2e/
npm run typecheck          # tsc over the same files
npm run check:doc-links    # every link and #heading in docs/ resolves
\`\`\`

## 100% coverage

Every frontend package, and the app, fails CI if line, function, branch or statement coverage drops below 100%. So new frontend code ships with tests that cover it:

- Cover edge cases on purpose (empty, missing, too big, invalid, error branches), not only the happy path.
- Give every component an accessibility test with \`jest-axe\`: \`expect(await axe(wrapper.html())).toHaveNoViolations()\`.
- For a branch that genuinely can't be reached, wrap it in \`/* v8 ignore start */ … /* v8 ignore stop */\` with a one-line reason. The single-line \`/* v8 ignore next */\` form doesn't work in this set-up.
- Before you rely on a test, check that it fails when the code is wrong.

The backend has no coverage number, but new code still gets tests, including tests that prove a security check refuses what it should.

## The two browser test suites

There are two, in different folders, run by different tools. Check both.

### App e2e (\`frontend/vue/e2e/\`)

Playwright with axe-core, against the built app and a mocked API. It covers the UI's structure (menu tabs, \`aria-controls\` targets, live regions), behaviour across pages (SDR audio surviving navigation), the docs page, and a real accessibility audit of every view, which catches what \`jest-axe\` can't (colour contrast, target size).

\`\`\`bash
cd frontend/vue && npm run build && npm run test:e2e    # build first: it tests frontend/spa-dist/
cd frontend/vue && npx playwright test e2e/sdr.spec.ts  # one file
cd frontend/vue && npm run test:e2e:report              # open the last report
\`\`\`

**Vitest passing isn't enough.** Restructuring UI (renaming a tab, moving a section between panels, adding a live region) can break e2e while every unit test passes. Run it before pushing any UI change.

### Full-stack smoke (\`tests/e2e/\`)

Drives a real running stack through the gateway. CI runs it three times, with different sections running: all of them, only SDR, and all but SDR.

\`\`\`bash
docker compose up -d --wait
npm run test:e2e:gateway
\`\`\`

It writes to the stack's databases, so use a throwaway stack, not the one with your data. \`SENTINEL_E2E_BASE_URL\` points it at a gateway (default \`http://localhost:8080\`). \`SENTINEL_E2E_SECTIONS\` says which sections the stack runs, for example \`space:service,sdr:absent\`; an unlisted section counts as running.

## Traps

- **Strict mode.** A Playwright locator that matches more than one element fails. Adding a second \`[role="status"]\` region can break an unrelated spec; use \`.first()\` when you mean "at least one".
- **A stale preview server.** e2e reuses a preview server already on port 4173. If results make no sense, stop it (\`lsof -ti :4173 | xargs kill\`), rebuild, and run again.
- **No Playwright browser.** If Playwright can't download its browser, add \`PLAYWRIGHT_CHANNEL=chrome\` to use your installed Chrome. Both suites accept it.
- **Wrong Node version.** Run \`nvm use\` in each new terminal.
- **A flaky CI download.** An image build that fails with a \`504\` while downloading go-pmtiles is GitHub, not your change. Re-run the failed jobs: \`gh run rerun <run-id> --failed\`.

## Docs screenshots

The images in \`docs/images/\` are taken by a script against the mocked API, never by hand. How to retake them is in [Frontend](../architecture/frontend.md#screenshots-in-these-docs).

## What runs where

| Check | Pre-commit hook (staged files) | CI |
|---|---|---|
| Prettier | fixes | checks |
| ESLint | fixes | checks |
| ruff lint and format | fixes | checks |
| Import boundaries | — | checks |
| vue-tsc and tsc | — | checks |
| Vitest at 100%, with jest-axe | — | checks |
| App e2e with axe-core | — | checks |
| pytest | — | checks |
| Full-stack smoke, three section set-ups | — | checks |
| Backend image for amd64 and arm64 | — | builds, doesn't push |
| Docs links and headings | — | checks |
| Changelog | — | rewritten after each merge to \`main\` |
`,Jn=`# Choose radios and hardware

Use this page to work out what to buy and how to connect it before you add radios to Sentinel. Online, you need no radio at all: Air, Space, Sea and Land's repeater list all work from internet sources. A radio adds listening, recording, decoding, and everything off grid.

## What you need for each job

Each dongle does one job at a time. A decoder holds its dongle for as long as it runs, so plan **one dongle per decoder** plus one for listening.

| You want to | Dongle | Antenna | Also needs |
|---|---|---|---|
| Listen to, record and scan frequencies | One, any RTL-SDR | One that suits the band you listen to | — |
| Follow satellite passes and record them | Shares the listening dongle | Ideally a satellite antenna (V-dipole or turnstile for 137 MHz weather satellites) | — |
| See aircraft off grid | One, on a [Sentry](reference/glossary.md#radio-and-signals) host (see below) | 1090 MHz | The \`adsb\` decoder |
| See ships off grid | One, full time | Marine VHF, about 162 MHz, mounted high | The \`ais\` decoder |
| See APRS stations | One, full time | 2 m (144 MHz) | The \`aprs\` decoder |
| Hear digital voice (DMR, P25 and others) | One, while decoding | One that suits the band | The \`voice-decoder\` decoder |

So listening plus every decoder is five dongles. Start with one for listening and add others when you want a decoder.

## Dongles

Sentinel works with **RTL-SDR** USB dongles, which receive roughly 25 MHz to 1.7 GHz. Prefer one with a TCXO (a temperature-compensated crystal oscillator), such as the RTL-SDR Blog V3 or V4: its frequency doesn't drift as it warms up, which matters for narrow digital signals.

## Antennas

The antenna matters more than the dongle.

- **Match the band.** An antenna cut for 1090 MHz hears aircraft well and little else. A wide-band discone suits general listening.
- **Height beats gain.** AIS, ADS-B and APRS are all line of sight: a modest antenna on the roof hears much further than a good one indoors.
- **Keep the cable short**, or use low-loss cable. At 1090 MHz, a few metres of thin cable loses much of the signal.

## Sharing a dongle over the network

Sentinel never plugs into a dongle directly. It reaches each one over your network, so a dongle can sit next to its antenna on another computer, such as a Raspberry Pi in the loft. That computer shares it in one of two ways:

| | rtl_tcp | Sentry |
|---|---|---|
| What it is | A small program that comes with the RTL-SDR drivers | A program for a Raspberry Pi that shares several dongles |
| Dongles per program | One (run one copy per dongle, each on its own port) | Several |
| Sentinel can claim it for a job and hand it back | No | Yes |
| Use it for | Listening, recording, APRS, AIS, voice | All of those, and off-grid aircraft (ADS-B), which needs a dongle Sentinel can claim |

To share a dongle with rtl_tcp, run this on the computer it is plugged into:

\`\`\`bash
rtl_tcp -a 0.0.0.0 -p 1234
\`\`\`

rtl_tcp has no password: anyone on your network can use the dongle, so only do this on a network you trust.

Then add it in Sentinel: [Add a radio](use/sdr/add-a-radio.md).

**One program at a time.** rtl_tcp serves one connection. While another program (or a second Sentinel) is connected, Sentinel can't use that dongle, and the radio shows **DISCONNECTED**. Close the other program, or restart \`rtl_tcp\`.

## The network

There are two links to think about:

- **Dongle to Sentinel.** The radio hub reads the raw signal from each connected dongle: about **33 Mbps** per dongle at the usual rate of 2.048 million samples a second, and about **38 Mbps** for off-grid ADS-B. Use a wired connection, or good Wi-Fi, between the computer with the dongles and the one running the radio hub. If that is a problem, run the radio hub [on the computer with the dongles](radio-host.md).
- **Sentinel to your browser.** This one is light: the browser receives a picture of the band and the audio, not the raw signal.

## The computer Sentinel runs on

Any computer that runs Docker: macOS, Windows or Linux, on Intel/AMD or 64-bit ARM (such as a Raspberry Pi 4 or 5). Allow a few gigabytes of disk for Sentinel itself, plus:

- **Recordings:** a WAV is small, but raw [IQ](reference/glossary.md#radio-and-signals) grows about 4 MB a second at the dongle's usual rate, about 14 GB an hour. See [Record what you hear](use/sdr/record.md).
- **Offline maps:** from a few megabytes for a town to many gigabytes for a country at full detail. The download page shows the size before you start; see [Download maps for offline use](use/offline-maps.md).

### Build for another kind of computer

To build Sentinel's backend image for both Intel/AMD (\`linux/amd64\`) and ARM (\`linux/arm64\`), for example to build on a PC for a Raspberry Pi, use \`docker buildx bake\`. It needs \`docker buildx\` (included with Docker Desktop) and, on Linux, QEMU for the other architecture: \`docker run --privileged --rm tonistiigi/binfmt --install all\`.

\`\`\`bash
docker buildx bake --print                                               # show what it will build
IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push    # both kinds, to your registry
docker buildx bake --set '*.platform=linux/arm64' --load                 # one kind, to this computer
docker buildx bake decoders --set '*.platform=linux/arm64' --load        # the decoders, this computer only
\`\`\`

An image for two kinds of computer can't be loaded locally, so push it or choose one platform with \`--load\`. The variables are \`IMAGE_REPOSITORY\` (default \`sentinel\`), \`IMAGE_TAG\` (default \`latest\`) and \`IMAGE_PLATFORMS\` (default \`linux/amd64,linux/arm64\`).

**Never push the decoder images to a public registry**; [Install and run decoders](decoders.md#for-developers) says why.

## Linux: "USB buffer" errors

On a Linux computer with a dongle plugged in, repeated errors about a **USB buffer** or \`usbfs\` come from Linux's limit on USB memory. Remove the limit, as root, on the computer the dongle is plugged into:

\`\`\`bash
echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb
\`\`\`

This lasts until the next reboot. To keep it, add \`usbcore.usbfs_memory_mb=0\` to the kernel command line (on a Raspberry Pi, \`/boot/firmware/cmdline.txt\`).

## Receiving responsibly

What you may listen to depends on your country. Read [Receiving responsibly](use/receiving-responsibly.md) before you start.
`,Yn=`# Welcome to Sentinel

Sentinel is a live map of what is around you, and a control panel for your own radios. It runs on your own computer, and it keeps working with no internet once you have downloaded maps and set up a radio.

It has five **sections**:

| Section | Shows |
|---|---|
| **AIR** | Aircraft near you, with alerts for emergencies |
| **SPACE** | Satellites and when they pass over you |
| **SEA** | Ships near you |
| **LAND** | UK amateur radio repeaters and APRS stations |
| **SDR** | Your radios: see a band, listen, scan and record |

Each section runs as its own service, so you can run all of them or only the ones you need.

**Next:** [Quick start](install.md) gets it running in a few commands. Developers: [System overview](architecture/overview.md) explains how it is built.
`,Xn=`# Quick start

You need [Docker](https://www.docker.com/products/docker-desktop/) (with Docker Compose) and Git. Nothing else.

## Start everything

\`\`\`bash
git clone https://github.com/barrygee/Sentinel.git
cd Sentinel
cp .env.example .env
docker compose up --build -d
\`\`\`

Open **http://localhost:8080**. The first build takes a few minutes; after that, start Sentinel with \`docker compose up -d\`.

## Start some sections

Name the sections you want, plus \`gateway\`:

\`\`\`bash
docker compose up -d gateway air               # one section
docker compose up -d gateway air sea space     # several
docker compose up -d gateway sdr radio         # SDR needs the radio hub too
docker compose up -d --scale land=0            # everything except one
\`\`\`

The section names are \`air\`, \`space\`, \`sea\`, \`land\` and \`sdr\`.

## Add decoders

Decoders read signals from your own radio. Each needs its own dongle.

\`\`\`bash
docker compose --profile all up -d --build     # all of them
docker compose --profile adsb up -d --build    # or one: adsb, ais, aprs, voice-decoder
\`\`\`

## Stop

\`\`\`bash
docker compose down
\`\`\`

Your data is kept.

## The config file

Every setting lives in one file, which Sentinel keeps up to date and reads back when you save it:

\`\`\`text
backend/data/sentinel_config.json
\`\`\`

Edit it in a text editor, or in the browser at **Settings › App Settings › Application Config** (**EDIT**, then **APPLY CHANGES**). For example, Land starts switched off; set \`"enabled": true\` under \`"land"\` to switch it on. More in [Edit the config file](use/config-file.md).

Settings about how Sentinel runs on this computer, such as where recordings are saved, are in \`.env\` instead. Each one is described in \`.env.example\`.

## First things to set

In **Settings** (the gear, bottom right):

1. **App Settings › Sentinel Location**: your latitude and longitude, then **APPLY CHANGES**.
2. **SPACE › Online Data Source**: pick a category, then **UPDATE TLE** to load satellites.
3. **SEA › AIS Data API Key**: a free key from AISStream, for ships ([how](use/sea.md#add-your-aisstream-key)).
4. **SDR › SDR Devices**: your radio, if you have one ([how](use/sdr/add-a-radio.md)).

Air works straight away.

## Next

- [Find your way around the screen](use/interface.md)
- [Run Sentinel with no internet](tasks/no-internet.md)
- [Troubleshooting](troubleshooting.md), if something doesn't start
`,Zn='# Check logs, health and backups\n\nUse this page to see whether Sentinel is healthy, read what it is doing, and keep a copy of your data. Every container and what it does is listed in [Ports and services](reference/ports-and-services.md). When something is wrong, go to [Troubleshooting](troubleshooting.md).\n\n## Everyday commands\n\n```bash\ndocker compose up -d                       # start, or apply a change (recreates only what changed)\ndocker compose up -d --build               # after an upgrade\ndocker compose up -d --scale land=0        # run without a section\ndocker compose ps                          # what is running, and whether it is healthy\ndocker compose logs -f app sea             # follow some services\' logs\ndocker compose restart sea                 # restart one service; the others keep working\ndocker compose down                        # stop everything; data is kept\n```\n\n- **Leaving a section out every time.** Pass the same `--scale` on every later `up`, or compose starts the section again.\n- **After changing `.env`.** Run `docker compose up -d`. Compose restarts only the containers the change affects.\n\n## Check health\n\n```bash\ndocker compose ps\n```\n\nEvery Sentinel service (`app`, `gateway`, `nats`, each section and `radio`) should say **(healthy)**. A service that says **(health: starting)** is still starting: sections wait for core, so give it a minute. Decoders don\'t report health; they say **Up**. `docker compose ps -a` also lists `service-credentials`, which runs once at start and then says **Exited (0)**. That is normal.\n\nTo check core from a script:\n\n```bash\ncurl -s http://localhost:8080/health\n```\n\nIt answers `{"status":"ok", …}`.\n\nIn the browser, a section that stops shows greyed out in the menu, and opening it shows a **section unavailable** page. The other sections keep working.\n\n## Read the logs\n\n```bash\ndocker compose logs -f sea                 # follow one service\ndocker compose logs --since 10m radio      # the last ten minutes\ndocker compose logs --tail 100 app         # the last hundred lines\ndocker logs sentinel-sea                   # the same, by container name\n```\n\nDecoders are in profiles, so name the profile too: `docker compose --profile all logs aprs-decoder`.\n\n### A healthy start\n\nSections start before core and wait for it. Each service logs, in order:\n\n```text\nsea service startup: waiting for core to answer (…)              # only if it started first\nsea service startup: connected to core at http://app:8000 after 4.2 s\nevent bus connected to NATS at tls://nats:4222\nregistration: sea registered with core at http://app:8000\n```\n\nCore logs `registry: section sea registered from http://sea:8000` for each section, and `registry: radio radio registered from …` for the radio hub. Decoders log `[aprs] connected to the radio hub through http://gateway:8080`; if the hub isn\'t up yet, they first log one `waiting for the radio hub through …; retrying quietly`.\n\n`service-credentials` prints `created …` lines the first time, and `… is up to date` after that.\n\nA full `docker compose down` then `docker compose up -d` logs no errors. If you see one, look it up in [Troubleshooting](troubleshooting.md#log-messages).\n\n## What to back up\n\nAll your data is on Docker volumes. Compose puts the project folder\'s name in front of each one, so `sdr_data` is usually `sentinel_sdr_data` and `sentinel_db` is `sentinel_sentinel_db`. `docker volume ls` lists them.\n\n| Volume | Holds | Back it up? |\n|---|---|---|\n| `sentinel_db` | Every setting, your alerts, downloaded offline maps | Yes |\n| `sdr_data` | Saved frequencies, groups, scanning ranges, recordings\' details | Yes |\n| `sdr_recordings` | Recording files, unless you [save them to a folder](use/sdr/record.md#where-recordings-are-saved) | If you want the recordings |\n| `radio_data` | Sentry hosts and their passwords | Yes |\n| `land_data`, `air_data`, `sea_data`, `space_data` | Caches and data downloaded again when online | Only for working off grid |\n| `service_credentials` | Certificates and logins | No: Sentinel creates new ones. Back it up only if a radio host uses it. |\n\nBackups of `radio_data` and `service_credentials` hold passwords and keys: store them as you would a password.\n\nFor **settings alone**, **Settings › App Settings › Export All Configuration** downloads them as one file, and the [config file](use/config-file.md) is a live copy.\n\n## Back up a volume\n\nThe commands use the small `alpine` image, which Docker downloads the first time. If you may need to back up with no internet, download it now: `docker pull alpine`.\n\nStop Sentinel first, so every database is closed and complete, then archive the volume into the current folder:\n\n```bash\ndocker compose down\ndocker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine \\\n  tar czf /backup/sdr_data.tgz -C /data .\ndocker compose up -d\n```\n\nRepeat the middle command for each volume you want, changing both names.\n\n## Restore a volume\n\nWith Sentinel stopped, extract the archive into the volume. The volume should be empty or new:\n\n```bash\ndocker compose down\ndocker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine \\\n  tar xzf /backup/sdr_data.tgz -C /data\ndocker compose up -d\n```\n',Qn=`# Run the radios on a second machine

## What it's for

The **radio hub** is the part of Sentinel that talks to your radios. Normally it runs on the same computer as the rest of Sentinel. You can run it, and the voice, APRS and AIS decoders, on a second computer next to the antennas instead: a **radio host**. The main computer (here called the **core host**) keeps the app, the gateway, the event bus and the sections, and your browser keeps using its address.

Do this when your dongles are a long way from the computer that runs Sentinel. Each connected dongle sends the radio hub a heavy stream of raw signal ([how much](hardware.md#the-network)); with the hub beside the dongles, only the light stream to the browser crosses your network.

*Figure: The two computers and what crosses the network between them. Every link between them is TLS.*

\`\`\`mermaid
flowchart LR
    browser["Browser"] -- "http :8080" --> gateway
    subgraph core["Core host"]
        gateway["gateway<br/>:8080, :8443"]
        nats["nats<br/>:4222"]
        app["app and sections"]
        gateway --> app
    end
    subgraph radiohost["Radio host"]
        rgw["radio-host-gateway<br/>:8443"]
        radio["radio hub"]
        decoders["decoders"]
        rgw --> radio
        decoders --> radio
    end
    gateway -- "TLS: radio requests" --> rgw
    radio -- "TLS: register, settings" --> gateway
    radio -- "TLS: events" --> nats
    radio --> dongles["Your dongles"]
    class radio accent
\`\`\`

**In words:**

1. Your browser talks only to the core host's gateway on port 8080.
2. The core host's gateway passes radio requests, such as the waterfall and audio, over TLS to the radio host's own gateway on port 8443, which hands them to the radio hub.
3. The radio hub reaches back to the core host over TLS: to register and read settings through port 8443, and to send and receive events through the event bus on port 4222.
4. The decoders run next to the radio hub on the radio host and never leave its own Docker network, so no audio crosses your network.

Every link is checked against a certificate authority Sentinel creates for your installation, and every program signs in with its own login. More in [Security](architecture/security.md).

## Before you start

- Both computers can reach each other by a name or address that doesn't change, such as a DHCP reservation or a local DNS name. On this page they are \`sentinel.lan\` (core host) and \`radio.lan\` (radio host).
- Both have Docker with Docker Compose, and a copy of Sentinel (\`git clone\`).
- The radio host can reach your dongles (rtl_tcp or Sentry).
- Sentinel already works on the core host ([Quick start](install.md)).

## Set up the core host

1. Add these lines to the core host's \`.env\`:

   \`\`\`bash
   # The hub runs on the radio host, so don't start one here.
   SENTINEL_RADIO_REPLICAS=0

   # The names the two computers reach each other by.
   SENTINEL_CORE_HOSTNAMES=sentinel.lan
   SENTINEL_RADIO_HOST_HOSTNAMES=radio.lan

   # Open the TLS service entrypoint and the event bus to your network.
   SENTINEL_SERVICE_ENTRYPOINT_ADDRESS=0.0.0.0:8443
   NATS_PUBLISHED_ADDRESS=0.0.0.0:4222
   \`\`\`

   Take any decoder profile out of \`COMPOSE_PROFILES\` (except \`adsb\`, which stays on the core host). Each variable is explained in [Environment variables](configuration.md#a-second-computer).

2. Apply it, which issues the certificates:

   \`\`\`bash
   docker compose up -d
   \`\`\`

3. If the event bus was already running, restart it, because it reads its settings only when it starts:

   \`\`\`bash
   docker compose restart nats
   \`\`\`

4. Export the radio host's credentials into a file:

   \`\`\`bash
   docker compose run --rm -T service-credentials \\
       python -m backend.scripts.service_credentials_bundle export radio-host > radio-host-credentials.tar.gz
   \`\`\`

   The file holds the radio hub's and each decoder's login, the certificate authority's public certificate, and the radio host gateway's certificate and key. It never holds the core host's own login or the certificate authority's private key. **Treat it as a password.**

5. Copy it to the radio host over a trusted connection, then delete it here:

   \`\`\`bash
   scp radio-host-credentials.tar.gz <radio-host-user>@radio.lan:<sentinel-folder>/
   rm radio-host-credentials.tar.gz
   \`\`\`

## Set up the radio host

1. In the radio host's copy of Sentinel, create \`.env\`:

   \`\`\`bash
   SENTINEL_CORE_ENTRYPOINT_URL=https://sentinel.lan:8443
   SENTINEL_CORE_NATS_URL=tls://sentinel.lan:4222
   SENTINEL_RADIO_HOST_URL=https://radio.lan:8443
   COMPOSE_PROFILES=aprs,ais            # the decoders you want: voice-decoder, aprs, ais, all
   \`\`\`

2. Import the credentials, then delete the file:

   \`\`\`bash
   docker compose -f compose.radio-host.yaml run --rm -T credentials-import < radio-host-credentials.tar.gz
   rm radio-host-credentials.tar.gz
   \`\`\`

3. Start it:

   \`\`\`bash
   docker compose -f compose.radio-host.yaml up -d --build
   \`\`\`

## Check it works

On the radio host, \`docker compose -f compose.radio-host.yaml logs radio\` should show:

\`\`\`text
radio service startup: connected to core at https://sentinel.lan:8443
event bus connected to NATS at tls://sentinel.lan:4222
registration: radio registered with core at https://sentinel.lan:8443
\`\`\`

Each decoder logs \`connected to the radio hub through http://radio:8000\`. On the core host, \`docker compose logs app\` shows \`registry: radio radio registered from https://radio.lan:8443\`.

Then, in the browser:

1. Re-add your Sentry hosts under **Settings › SDR › Sentry Hosts**. They are kept in the radio hub's own database, which starts empty on a new radio host.
2. Check each radio's address in **Settings › SDR › SDR Devices**. Addresses are now as seen from the radio host: for an rtl_tcp on the radio host itself, use \`host.docker.internal\`.
3. Open **SDR**. The waterfall and audio work as before.

## Changing things later

- **A new or changed host name.** Update \`SENTINEL_CORE_HOSTNAMES\` or \`SENTINEL_RADIO_HOST_HOSTNAMES\`, then on the core host run \`docker compose up -d\` and \`docker compose restart nats gateway\`. The certificates are reissued, so export a new credentials file and import it on the radio host.
- **Replacing a login.** Delete its \`credentials/<caller>/\` folder on the \`service_credentials\` volume, run \`docker compose up -d\` on the core host, then export and import again.
- **Moving the hub back.** On the radio host, run \`docker compose -f compose.radio-host.yaml down\`. On the core host, remove \`SENTINEL_RADIO_REPLICAS=0\` from \`.env\` and run \`docker compose up -d\`. Sentry hosts added on the radio host stay there, so add them again.

## Troubleshooting

| What you see | Likely cause |
|---|---|
| Hub logs \`waiting for core to answer (… certificate verify failed …)\` | The host in \`SENTINEL_CORE_ENTRYPOINT_URL\` isn't in \`SENTINEL_CORE_HOSTNAMES\`, or the credentials file is older than a host-name change. |
| Hub logs \`waiting for core to answer (… Connection refused …)\` | \`SENTINEL_SERVICE_ENTRYPOINT_ADDRESS\` still binds \`127.0.0.1\`, or a firewall blocks port 8443. |
| Hub never logs \`event bus connected\` | \`NATS_PUBLISHED_ADDRESS\` isn't open, or \`nats\` wasn't restarted after a host-name change. |
| SDR shows the radio hub unavailable | The core host can't reach \`SENTINEL_RADIO_HOST_URL\`: check port 8443 on the radio host, and that its name is in \`SENTINEL_RADIO_HOST_HOSTNAMES\`. |
| \`registration: core refused radio (401)\` | The credentials no longer match the core host's (its volume was recreated). Export and import again. |
| Gateway or nats won't start on the core host | Port 8443 or 4222 is already used by something else on it. |
`,$n=`# Commands cheat sheet

The commands you'll use most, in one place. Run them in the folder you installed Sentinel in. This page only lists them: each part links to the page that explains them.

## Run Sentinel

From [Quick start](../install.md) and [Check logs, health and backups](../operations.md):

\`\`\`bash
docker compose up -d                      # start, or apply a change to .env
docker compose up --build -d              # first start, or after an upgrade
docker compose up -d gateway air sea      # only some sections
docker compose up -d --scale land=0       # everything except one
docker compose down                       # stop; your data is kept
docker compose restart sea                # restart one service
\`\`\`

## Decoders

From [Install and run decoders](../decoders.md):

\`\`\`bash
docker compose --profile all up -d --build                      # every decoder
docker compose --profile aprs up -d --build                     # one: voice-decoder, aprs, ais, adsb
docker compose up -d --build --no-deps aprs-decoder             # rebuild one decoder without restarting the app
docker compose --profile all down && docker compose up -d       # back to no decoders
\`\`\`

## Check on it

From [Check logs, health and backups](../operations.md):

\`\`\`bash
docker compose ps                         # every service should say (healthy)
docker compose logs -f app sea            # follow some logs
docker compose logs --since 10m radio     # the last ten minutes of one
curl -s http://localhost:8080/health      # core answers {"status":"ok", …}
\`\`\`

## Upgrade

From [Upgrade Sentinel](../upgrading.md):

\`\`\`bash
git pull
docker compose up --build -d
\`\`\`

## Develop

From [Set up for development](../development/setup.md) and [Run tests and quality checks](../development/testing.md):

\`\`\`bash
nvm use && npm ci                                   # once, and after a pull that changes package-lock.json
cd frontend/vue && npm run dev                      # frontend with hot reload on :5173
cd frontend/vue && npm run build                    # rebuild frontend/spa-dist/ (commit it)
uv run --project backend pytest                     # backend tests (from the repo root)
cd frontend/vue && npm run test:coverage            # app tests, 100% coverage
cd frontend/vue && npm run test:e2e                 # browser tests over the built app
npm run web-packages -- test:coverage               # every shared and section package
npm run check:doc-links                             # every link in docs/ resolves
\`\`\`
`,er=`# Glossary

The words these docs use, in three groups, each in alphabetical order: radio terms, the words for Sentinel's own parts, and the developer terms used in **How it works** and **Develop**.

## Radio and signals

| Word | Means |
|---|---|
| **ADS-B** | Automatic Dependent Surveillance–Broadcast. Aircraft broadcast their position, height, speed and callsign on 1090 MHz about once a second. The **AIR** section shows them. |
| **AIS** | Automatic Identification System. Ships broadcast their position, course and name on two marine VHF channels (161.975 and 162.025 MHz). The **SEA** section shows them. |
| **AISStream** | [aisstream.io](https://aisstream.io), a free online service that relays AIS from receivers around the world. Sea uses it online; it needs a key, and allows one connection per key. |
| **APRS** | Automatic Packet Reporting System: amateur radio stations sharing positions, weather and short messages on one channel (144.800 MHz in Europe). The **LAND** section shows the stations your radio hears. |
| **Band plan** | Which kinds of signal live in which frequency ranges. The SDR waterfall labels bands from it. |
| **Dongle** | A USB radio stick. Sentinel uses **RTL-SDR** dongles. |
| **Decoder** | A program that turns a digital signal into something you can read or hear. Each runs in its own optional container and needs its own dongle. |
| **Footprint** | The area of Earth that can see a satellite at a given moment. |
| **IQ** | The raw signal from a radio: a stream of sample pairs that holds the whole band it is receiving. Sentinel can save it alongside a recording. |
| **Pass** | One trip of a satellite across your sky, from rising (AOS) to setting (LOS). |
| **Repeater** | A radio station on a hill or mast that retransmits what it hears, so handheld radios can reach further. Land lists every UK amateur repeater. |
| **RTL-SDR** | A family of cheap USB dongles that can receive roughly 25 MHz to 1.7 GHz. |
| **rtl_tcp** | A small program, part of the RTL-SDR drivers, that shares one dongle over the network. One program can use it at a time. |
| **SDR** | Software-defined radio: a radio whose tuning and demodulation are done in software. Also the name of Sentinel's radio section. |
| **Sentry** | A program that runs on a Raspberry Pi and shares several dongles over the network. Sentinel can claim a Sentry dongle, tune it and hand it back. |
| **Squawk** | The four-digit code an aircraft's transponder sends. 7700 (emergency), 7600 (radio failure) and 7500 (hijack) raise an alert. |
| **TLE** | Two-line element set: a short public description of a satellite's orbit. Space works out every position from it. |
| **Waterfall** | A picture of signal strength across a band, scrolling down over time. |

## Sentinel's parts

| Word | Means |
|---|---|
| **Alert** | A message Sentinel raises for something that needs your attention, such as an emergency squawk or a satellite pass. |
| **Config file** | \`backend/data/sentinel_config.json\`: every setting in one file, kept up to date as settings change and read back when you edit it. |
| **Core** | The \`app\` service: what every section depends on (settings, alerts, offline maps, the list of running services). It is always running. |
| **Gateway** | The \`gateway\` container, the one address a browser uses (port 8080). It passes each request to the service that answers it. |
| **Off Grid** | The mode in which every section uses sources that need no internet: your own radios, downloaded maps, saved satellite data. Its opposite is **Online**. |
| **Offline maps** | Map tiles saved on your computer, so maps work with no internet. Some are bundled; you can download more. |
| **Radio** | One dongle you have added to Sentinel. |
| **Radio host** | A second computer that runs the radio hub and decoders, next to the antennas. |
| **Radio hub** | The \`radio\` service, the only part of Sentinel that talks to radios. |
| **Section** | One of **AIR**, **SPACE**, **SEA**, **LAND** and **SDR**: a backend service plus its part of the screen. |
| **Sentinel Location** | Your position, set in Settings. Distances, passes and searches use it. |
| **Tile** | A square piece of a map at one zoom level. Sentinel keeps tiles in \`.pmtiles\` files. |

## Developer terms

| Word | Means |
|---|---|
| **Caddy** | The web server the gateway runs. |
| **Capability** | A service one section's UI offers the others through the shell, such as SDR's \`radio\`, so they can use it without importing SDR. |
| **Compose profile** | A named group of optional containers in \`docker-compose.yml\`, started with \`--profile <name>\`. The decoders are profiles. |
| **Event bus** | How services send each other short messages, on named **subjects** such as \`settings.changed.sdr\`. It runs over **NATS**. |
| **FastAPI** | The Python web framework every backend service is written in. |
| **Hook** | A function a module hands over to be called at a set moment, such as start-up. |
| **Lifecycle** | A module's start-up and shut-down hooks: \`prepare\`, \`start\`, \`wake\` and \`stop\`. |
| **Manifest** | What a service tells core about itself when it registers: its id, address and the paths it serves. |
| **Module Federation** | The build feature that lets the shell load each section's UI at run time. |
| **NATS** | A small message broker that carries the event bus between containers. |
| **Pinia** | Vue's state library. A **store** holds state that several components share. |
| **Remote** | A section's UI, built as its own bundle and loaded by the shell. |
| **Service** | One backend process in its own container: core, a section, or the radio hub. |
| **Settings client** | The code a service uses to read and write settings through core, instead of opening the settings table itself. |
| **Shell** | The Vue app that loads in the browser and hosts every section's UI. |
| **SIGTERM** | The signal Docker sends a process to ask it to stop. |
| **SQLAlchemy** | The Python library that reads and writes the SQLite databases. Its **ORM models** are Python classes that describe tables. |
| **SQLite** | A database that is a single file, with no database server. Every service has one. |
| **SSE** | Server-sent events: a one-way stream of updates from server to browser over ordinary HTTP. Alerts reach the browser this way. |
| **Uvicorn** | The program that runs a FastAPI service. |
| **Vite** | The tool that builds the frontend, and serves it with **hot reload** (changes appear without a page reload) while you develop. |
| **Volume** | Storage Docker keeps for a container, which survives the container being removed. Every database is on one. |
`,tr="# Ports and services\n\nEvery container Sentinel runs: what it does, the ports it uses and where its data is kept. Container names are `sentinel-<service>`, so `docker logs sentinel-sea` shows Sea's log.\n\n## Always running\n\nA plain `docker compose up -d` starts these.\n\n| Service | What it does | Data |\n|---|---|---|\n| `service-credentials` | Runs once and exits. Creates this installation's certificate authority, TLS certificates and a separate login for every service and decoder. | `service_credentials` |\n| `nats` | The event bus: short messages between services. TLS only, one login per service. | — |\n| `app` | Core: the shell UI, settings and the config file, alerts, offline maps, the list of running services. | `sentinel_db` (`sentinel.db`, downloaded map tiles) |\n| `gateway` | Caddy, the one address a browser uses. Passes each request to the service that answers it. | — |\n| `air` | The **AIR** section. | `air_data` (`air.db`) |\n| `space` | The **SPACE** section. | `space_data` (`space.db`) |\n| `sea` | The **SEA** section, and the one AISStream connection. | `sea_data` (`sea.db`) |\n| `land` | The **LAND** section. | `land_data` (`land.db`) |\n| `sdr` | The **SDR** section: saved frequencies, groups, scanning ranges, recordings. | `sdr_data` (`sdr.db`, older recordings); recordings in `sdr_recordings` or your own folder |\n| `radio` | The radio hub: every connection to a radio, the spectrum and audio streams, decoding, raw IQ capture. | `radio_data` (`radio.db`: Sentry hosts) |\n\nTo leave one out, see [Quick start](../install.md#start-some-sections). What the browser shows when one is missing or stopped is in [Troubleshooting](../troubleshooting.md#a-section-is-missing-or-greyed-out).\n\n## Optional: decoders\n\nEach decoder is a [compose profile](glossary.md#developer-terms), started with `--profile <name>`, and needs its own dongle. `--profile all` starts the first four.\n\n| Profile | Service | What it decodes | Built from |\n|---|---|---|---|\n| `voice-decoder` | `voice-decoder` | Digital voice (dsd-fme) | `decoder/` |\n| `aprs` | `aprs-decoder` | APRS (Direwolf) | `decoder/aprs/` |\n| `ais` | `ais-decoder` | AIS (Direwolf 1.8, built from source) | `decoder/ais/` |\n| `adsb` | `adsb-decoder` | ADS-B (readsb) | `decoder/adsb/` |\n| `decoder-stub` | `stub-decoder` | Nothing: a test double for developers | `decoder/stub/` |\n\nDecoders keep no data of their own.\n\n## Ports on your computer\n\n| Port | Service | Used by | Open to your network? |\n|---|---|---|---|\n| `8080` | gateway | Your browser | Yes |\n| `8443` | gateway (TLS service entrypoint) | Sentinel services on a second computer | No: `127.0.0.1` unless `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` is set |\n| `4222` | nats | Sentinel services on a second computer | No: `127.0.0.1` unless `NATS_PUBLISHED_ADDRESS` is set |\n| `8090` | adsb-decoder, when running | Reading the decoded aircraft directly | No: `127.0.0.1` unless `SENTINEL_ADSB_DECODER_ADDRESS` is set |\n\nThe variables are in [Environment variables](../configuration.md#a-second-computer). If one of these ports is already in use, that container won't start; `docker compose ps -a` shows it as exited.\n\n## Ports inside Docker only\n\nThese are on the `sentinel` Docker network and can't be reached from your computer.\n\n| Port | Where | What |\n|---|---|---|\n| `8000` | `app`, every section, `radio` | Each service's HTTP API |\n| `2019` | `gateway` | Caddy's admin API, which core updates with each service's routes |\n| `7355` | `radio` | Audio for the voice decoder |\n| `7356` (UDP) | `radio` | Decoded voice coming back from the voice decoder |\n| `7357` | `radio` | Audio for the APRS decoder |\n| `7358` | `radio` | Two-channel audio for the AIS decoder |\n| `7370` | `radio` | Audio for the stub decoder |\n\n## On a radio host\n\n`compose.radio-host.yaml` runs these on [a second computer](../radio-host.md):\n\n| Service | What it does | Port |\n|---|---|---|\n| `credentials-import` | Runs once: unpacks the credentials exported from the main computer. | — |\n| `radio` | The radio hub. | — |\n| `radio-host-gateway` | Caddy: the main computer reaches the hub through it, over TLS. | `8443` (`SENTINEL_RADIO_HOST_GATEWAY_ADDRESS`) |\n| `voice-decoder`, `aprs-decoder`, `ais-decoder`, `stub-decoder` | The decoders, as above. | — |\n\nHow the containers start and talk to each other is in [How Sentinel runs in Docker](../architecture/docker.md).\n",nr=`# What's new

Every change to Sentinel is listed in the changelog, newest first, grouped into features, fixes and other changes. It is written automatically from each change's description when it joins the main branch.

[Read the changelog on GitHub](https://github.com/barrygee/Sentinel/blob/main/CHANGELOG.md) (online only). With no internet, open \`CHANGELOG.md\` in the folder you installed Sentinel in.

To get the changes, see [Upgrade Sentinel](../upgrading.md). Changes that need you to do something by hand are listed there too.
`,rr=`# Get alerted to aircraft emergencies

Have Sentinel tell you whenever an aircraft near you declares an emergency, whether or not anyone is watching the map. Sentinel keeps checking in the background, so the alert is waiting for you when you next open it.

## Before you start

- Sentinel installed and running, with the Air section ([Quick start](../install.md)).
- Online: an internet connection. Off grid: off-grid Air set up ([Air: Off grid](../use/air.md#off-grid)).

## Steps

1. **Open your location setting.** Open **Settings › App Settings › Sentinel Location**.
2. **Enter where you are.** Type your **LATITUDE** and **LONGITUDE** in decimal degrees.
3. **Apply it.** Select **APPLY CHANGES**. The fields keep your values, and **RANGE RING** on the Air map now centres on you. Online, the background check now covers the area around this point; off grid, it covers what your receiver hears.
4. **Turn on the sound** (optional). Turn on **Settings › App Settings › Alert Sound** and select **APPLY CHANGES**, to hear new alerts as well as see them.
5. **Choose how often to check** (optional). **Settings › AIR › Online Squawk Checks** (and **Off Grid Squawk Checks**) set the seconds between background checks. Raise them to use less internet or radio time; see [Air: Settings](../use/air.md#settings).

That's all. The check runs whenever no browser has the AIR map open; while one does, the map's own updates are checked instead.

## When an emergency happens

An alert appears under **ALERTS** in the sidebar, naming the aircraft and the emergency: squawk 7700 (general emergency), 7600 (radio failure) or 7500 (hijacking). What each code means, and how far the check reaches, is in [Air: Get alerted to emergencies](../use/air.md#get-alerted-to-emergencies).

Select the alert to open **AIR** centred on the aircraft. Its details show its height, speed and heading. Another alert follows when it changes back to a normal code.

Most emergency squawks end safely: many are precautions, such as a medical problem on board or a fault the crew are handling calmly. Don't share or act on them as news.

## Troubleshooting

- **No alerts, but you know of an emergency.** Check that the aircraft was within range of your **Sentinel Location** (see [Air](../use/air.md#get-alerted-to-emergencies)), that the \`air\` service is running (\`docker compose ps air\`), and, off grid, that the decoder was receiving.
- **Alerts arrive late.** Raise the check frequency by lowering **Online Squawk Checks**.
`,ir=`# Find and listen to a local repeater

Use the Land map to find amateur radio repeaters near you, then listen to one with your radio. Repeaters carry local amateur conversations and nets, and are a good way to hear what is happening on the bands near you.

## Before you start

- Land switched on: [Switch Land on](../use/land.md#switch-land-on).
- A radio added, with an antenna for the band (2 m and 70 cm are the busiest): [Add a radio](../use/sdr/add-a-radio.md).

## Steps

1. **Open LAND.** The map shows UK repeaters. Select **GO TO MY LOCATION** in the map controls to centre on where you are.
2. **Open the filters.** Open **FILTER** in the sidebar.
3. **Narrow it down.** Choose a **Band** such as 2 m, a **Mode** such as FM (most handheld radios), and **On air** under **Status**. The map shows only matching repeaters.
4. **Pick one.** Select a nearby repeater on the map or in the list. Its details show where it is, its height, and each channel's frequencies and access tone.
5. **Listen.** Select its **OUTPUT** frequency. Your radio tunes to it in the right mode and starts playing.
6. **Set the squelch.** In **SDR**, under **CONTROLS**, raise **SQUELCH** until the hiss stops between transmissions.
7. **Save it** (optional). Select **SAVE FREQUENCY** on the repeater's channel to add it to your saved frequencies, so you can tune to it or scan it later from **SDR**.

The tuned frequency shows in the footer, and the audio keeps playing while you look at other sections.

## Tips

- Repeaters are busiest at evenings and weekends, and during scheduled nets.
- Several repeaters saved in one group can be scanned together: see [Scan saved frequencies](../use/sdr/frequencies.md#scan-saved-frequencies).
- Listening needs no licence. To talk through a repeater you need an amateur radio licence, and a transmitter: Sentinel only receives.

## Troubleshooting

- **The frequency can't be selected.** No radio is connected. The button says **Connect an SDR to tune**.
- **Only noise.** The repeater may be out of range, or quiet. Try one nearer, or higher up, and check the antenna suits the band.
- **The repeater's details look wrong.** Online, the directory updates daily from ukrepeater.net. You can correct an entry in **Settings › LAND › Repeater Directory (JSON)**.
`,ar=`# Run Sentinel with no internet

Sentinel can keep working with no internet connection at all: in a remote place, in a power cut with the router down, or when you don't want to depend on online services. This page puts the off-grid set-up in order. Do the first part while you still have a connection.

## Before you start

- Sentinel installed and running ([Quick start](../install.md)).
- For live aircraft, ships or APRS off grid: an RTL-SDR dongle and antenna for each one you want running at the same time. See [Decode digital signals](../use/sdr/decode.md#why-each-decoder-needs-its-own-dongle).

## What works off grid

| Section | Off grid, it uses | You need |
|---|---|---|
| **AIR** | Your own radio, through the ADS-B decoder | A dongle and a 1090 MHz antenna on a [Sentry host](../use/sdr/add-a-radio.md#add-a-sentry-host) |
| **SPACE** | Satellite data you loaded earlier | Satellites loaded while online |
| **SEA** | Your own radio, through the AIS decoder | A dongle and a marine VHF antenna |
| **LAND** | The built-in repeater directory, and your own radio for APRS | A dongle and a 2 m antenna, for APRS |
| **SDR** | Your radios, as always | Your radios on the local network |
| Maps | Areas you downloaded | Areas downloaded while online |

## While you still have internet

1. **Download maps** for the area you'll be in: [Download maps for offline use](../use/offline-maps.md). Include **Terrain** if you want hills and contours. Without a download, maps are blank off grid.
2. **Load satellites**: **Settings › SPACE › Online Data Source**, choose each category you want, and select **UPDATE TLE**. See [Space](../use/space.md#off-grid).
3. **Build the decoders** you'll need, because building downloads software. For example, all of them:

   \`\`\`bash
   docker compose --profile all up -d --build
   \`\`\`

   Or only the ones you need: \`--profile adsb\`, \`--profile ais\`, \`--profile aprs\`, \`--profile voice-decoder\`.

## Set up your radios

1. **Add your radios** in **Settings › SDR**: [Add a radio](../use/sdr/add-a-radio.md).
2. **Give Air its radio** in **Settings › AIR › Off Grid ADS-B SDR**. It must be a dongle on a [Sentry host](../use/sdr/add-a-radio.md#add-a-sentry-host).
3. **Give Sea its radio** in **Settings › SEA › Off Grid AIS SDR**.
4. **Give Land its radio** in **Settings › LAND › Off Grid APRS SDR**.
5. Select **APPLY CHANGES**.

Skip any section you don't need off grid.

## Switch to off grid

1. Open **Settings › App Settings › Connectivity Mode** and choose **OFF GRID**.
2. Select **APPLY CHANGES**.
3. Open each section and check it shows data. A notice at the top of a section says what is missing, if anything.

Choosing **Connectivity Mode** sets every section to that mode and replaces any overrides. To keep one section online, set its **Source Override** afterwards.

## How Sentinel chooses where data comes from

Air and Sea can also use a mode of their own, whatever the rest of Sentinel uses: their **Source Override** setting.

*Figure: For each section, Sentinel checks the section's own override first, then the app-wide mode, to decide where its data comes from.*

\`\`\`mermaid
flowchart TD
    start["A section needs data"] --> override{"Section has a<br/>Source Override?"}
    override -- "Yes" --> useOverride["Use the override:<br/>ONLINE or OFF GRID"]
    override -- "No" --> appMode["Use Connectivity Mode:<br/>ONLINE or OFF GRID"]
    useOverride --> mode{"Which mode?"}
    appMode --> mode
    mode -- "ONLINE" --> online["Internet feed:<br/>adsb.lol, AISStream,<br/>CelesTrak, online maps"]
    mode -- "OFF GRID" --> offgrid["Your radios, decoders,<br/>stored satellites and<br/>downloaded maps"]
    class override accent
    class mode accent
\`\`\`

**In words:**

1. When a section needs data, Sentinel first checks whether that section has its own **Source Override** (Air and Sea have one).
2. If it has, the override decides. If not, the app-wide **Connectivity Mode** decides.
3. **ONLINE** uses internet feeds: adsb.lol for aircraft, AISStream for ships, CelesTrak for satellites, and online maps.
4. **OFF GRID** uses your radios and decoders, the satellites you stored, and the maps you downloaded.

## Going back online

Choose **ONLINE** in **Connectivity Mode** and select **APPLY CHANGES**. Then refresh the satellites (**UPDATE TLE**), since they drift out of date while offline.

## Troubleshooting

- **The map is blank.** You are outside the areas you downloaded, or you didn't download any. Downloads need internet, so do it when you are next online.
- **Air is empty.** See [Air: Troubleshooting](../use/air.md#troubleshooting).
- **Sea says no receiver is selected.** Set **Off Grid AIS SDR**.
- **Satellite positions look wrong after weeks offline.** The satellite data is old. It will be fixed when you can update it.
`,or=`# Catch a satellite pass and record it

Set Sentinel to tune your radio to a satellite as it rises, record it, and tune back when it sets, so you catch the pass even if you aren't watching. A good first target is the International Space Station, or a weather or amateur radio satellite.

## Before you start

- Your **Sentinel Location** is set (**Settings › App Settings › Sentinel Location**). Passes are worked out for that spot.
- A radio is added and connected: [Add a radio](../use/sdr/add-a-radio.md).
- An antenna that suits the satellite's band, ideally outdoors with a clear view of the sky. Most amateur and weather satellites transmit around 137 MHz or 145 MHz.

## Steps

1. **Load the satellites.** In **Settings › SPACE › Online Data Source**, choose a category such as **Amateur Radio**, **Weather** or **Space Stations**, then select **UPDATE TLE**. The satellites appear in **SPACE**.
2. **Choose where the recording goes** (optional). Set **Settings › SDR › SDR Options › Recordings Folder** to something like \`satellites\`, and select **APPLY CHANGES**. See [Record what you hear](../use/sdr/record.md#the-recordings-folder).
3. **Find a good pass.** Open **SPACE** and the **PASSES** pane in the sidebar. Pick a pass with a high maximum elevation: one of 30° or more is stronger and clearer than one that skims the horizon. Select it to see its path across your sky.
4. **Get a reminder** (optional). Select **Enable pass alerts** (the bell). About five minutes before the satellite rises, an alert tells you it is coming.
5. **Turn on auto-tune.** Select **Auto-tune SDR**. If it isn't offered, Sentinel doesn't know the satellite's downlink frequency; add it in **Settings › SPACE › Satellite Frequencies (JSON)**.
6. **Turn on recording.** Select **Record pass**.
7. **Leave Sentinel open** in a browser tab. You can look at other sections in the meantime.

When the satellite rises, the radio tunes to its downlink, recording starts, and an alert says so. When it sets, recording stops and the radio goes back to what it was doing.

## Afterwards

Open **SDR** and the **RECORDINGS** tab. The pass is there: play it, or select **Download WAV** to open it in other software. For a weather satellite's picture, open the WAV in an APT image decoder. To re-tune or decode it differently later, turn on **Record Raw IQ with Recordings (Large Files)** before the next pass; see [WAV and raw IQ](../use/sdr/record.md#wav-and-raw-iq).

## Troubleshooting

- **An alert says the pass was skipped because the radio is busy.** An earlier pass still has the radio. Only one pass can use a radio at a time.
- **Nothing happened at the pass.** Check that a browser had Sentinel open, and that the radio wasn't held by a decoder (it reads **RESERVED** in the SDR panel).
- **The recording is silent.** The squelch was above the signal, so nothing was recorded. Lower **SQUELCH** in the SDR panel before the next pass.
- **The signal fades in and out.** Normal near the horizon, and as the satellite turns. A better antenna or a higher pass helps.
`,sr=`# Track ships off grid with your own radio

Receive ships' AIS broadcasts with your own radio, so the Sea map works with no internet and no AISStream key. If you can see the sea, or a busy river or estuary, you can usually hear ships within 10 to 30 miles, and further with a high antenna.

## Before you start

- An RTL-SDR dongle you can give to AIS full time. While AIS is running, that dongle isn't available for anything else.
- A marine VHF antenna, mounted as high as you can. AIS is line of sight, so height matters more than gain.
- The dongle shared on your network and added to Sentinel: [Add a radio](../use/sdr/add-a-radio.md).

## Steps

1. **Build and start the AIS decoder.** It builds its own decoder from source, so the first build takes several minutes:

   \`\`\`bash
   docker compose --profile ais up -d --build
   \`\`\`

   When it finishes, \`docker compose --profile ais ps\` lists \`ais-decoder\` as running.

2. **Choose the radio.** Open **Settings › SEA › Off Grid AIS SDR** and pick the dongle on your marine antenna.
3. **Switch Sea off grid.** Set **Settings › SEA › Source Override** to **OFF GRID**. (To take all of Sentinel off grid instead, use **Settings › App Settings › Connectivity Mode**.)
4. **Select APPLY CHANGES.**
5. **Open SEA.** Sentinel tunes the radio and starts decoding. Ships appear as they are heard; a busy area fills in within a few minutes.

Decoding keeps running in the background with no browser open, and starts again after a restart.

## How it works

Ships send AIS on two channels, **A (161.975 MHz)** and **B (162.025 MHz)**, taking turns between them. Sentinel tunes the dongle between the two and decodes both at once, so it doesn't miss half the traffic. Ships heard this way go into the same store as the online feed, so the map, tracks and ship types work the same either way.

## Troubleshooting

The notice at the top of the Sea map says what is wrong; [Sea: Troubleshooting](../use/sea.md#troubleshooting) explains each one. To see what the decoder itself reports, run \`docker compose --profile ais logs ais-decoder\`. More on the decoder is in [Install and run decoders](../decoders.md).
`,cr="# Troubleshooting\n\nStart here when something isn't working. The first part covers Sentinel as a whole: starting it, sections, logins and log messages. The second part lists the problems on each section's page, by what you see.\n\nFirst, check what is running:\n\n```bash\ndocker compose ps -a\n```\n\nEvery Sentinel service should say **(healthy)**. What healthy logs look like is in [Check logs, health and backups](operations.md#a-healthy-start).\n\n## Sentinel won't start\n\n| What you see | What to do |\n|---|---|\n| `docker: command not found`, or `Cannot connect to the Docker daemon` | Docker isn't installed or isn't running. Start Docker Desktop (or the Docker service on Linux). |\n| `port is already allocated` for 8080 | Something else on this computer uses port 8080. Stop it: Sentinel's browser port can't be changed in `.env`. |\n| `gateway` or `nats` exited, with an error about port 8443 or 4222 | Something else uses that port. Stop it, or move the port: see [Ports and services](reference/ports-and-services.md#ports-on-your-computer). |\n| The first build fails while downloading | A download from GitHub or a package mirror failed. Run `docker compose up --build -d` again. |\n| `http://localhost:8080` doesn't load, but `docker compose ps` looks healthy | Wait a minute after start-up and reload. If it still fails, check `docker compose logs gateway app`. |\n| Sections stay at **(health: starting)** | They wait for core. Check `docker compose logs app` for an error. Each section logs `waiting for core to answer` until core is up. |\n| On Linux: `Permission denied` writing `sentinel_config.json`, or recordings owned by another user | Set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` to your own ids. See [Environment variables](configuration.md#choose-where-files-go). |\n\n## A section is missing or greyed out\n\n| What you see | Meaning | What to do |\n|---|---|---|\n| The section isn't in the menu at all | Its service isn't running, or was never started (for example, left out with `--scale`) | `docker compose ps -a`, then `docker compose up -d <section>` |\n| **LAND** isn't in the menu, but `land` is running | Land is switched off until you switch it on | [Switch Land on](use/land.md#switch-land-on) |\n| The section is greyed out, and opening it shows **section unavailable** | Its service started, then stopped answering. Core notices within about 30 seconds. | `docker compose logs <section>`, then `docker compose restart <section>` |\n| SDR's waterfall and audio stop, but saved frequencies and recordings still show | The radio hub (`radio`) is down. Frequencies and recordings belong to the `sdr` service. | `docker compose logs radio` |\n| A section's data looks old after going back to an older version | Data made while it ran as its own service is only in its own volume | See [Upgrade Sentinel](upgrading.md) |\n\n## Logins between services\n\nSentinel's services sign in to each other with logins Sentinel creates for itself. When one fails, the log or response says which part:\n\n| Response | Message | Cause |\n|---|---|---|\n| 503 | `Internal service access is disabled on this deployment` | The service has no list of logins: `service-credentials` didn't run. Run `docker compose up -d`. |\n| 401 | `Invalid service credential` or `invalid decode secret` | The login isn't one Sentinel knows. Logins were recreated but the service wasn't restarted, or a radio host has an old credentials file. Restart the service; for a radio host, export and import again ([Run the radios on a second machine](radio-host.md#changing-things-later)). |\n| 403 | `This service may not do that` or `not a <kind> decoder` | A known service tried something it isn't allowed to. This is a fault in Sentinel; report it. |\n\nA `404` from `http://localhost:8080/internal/…` is on purpose: those routes are only for Sentinel's own services.\n\n## Log messages\n\n| Message | Meaning |\n|---|---|\n| `<id> service startup: waiting for core to answer (…)` | The service started before core. It carries on once core answers. Normal at start-up. |\n| `waiting for the radio hub through …; retrying quietly` | A decoder started before the radio hub. Normal at start-up. |\n| `legacy import: copied N rows into …` | Normal, once, after an upgrade: see [Upgrade Sentinel](upgrading.md#every-section-runs-as-its-own-service-october-2026). |\n| NATS `permissions violation` | A service used an event-bus subject it isn't allowed. A fault in Sentinel (developers: see [Event bus](architecture/event-bus.md#adding-a-subject)). |\n| `ConnectError` tracebacks from several sections for a few seconds | Core restarted, for example after `--build` without `--no-deps`. They stop once it is back. |\n| `IQ captures: radio hub unreachable, …`, `Radio hub no longer holds the IQ of recording N`, `Recording N was never stopped …`, `IQ capture N reached the … recording limit` | About recordings: see [Record what you hear](use/sdr/record.md#troubleshooting). |\n| Radio hub: `GET …/api/status 401`, then a login, then `200` | The normal first sign-in to a Sentry host. A `401` on the login itself means its console password is wrong. |\n\n## Problems in a section\n\nEach section's page has a **Troubleshooting** part. By what you see:\n\n**Air**\n- The map is empty off grid, or says \"No data source configured\": [Air troubleshooting](use/air.md#troubleshooting)\n- No emergency alerts when the map is closed: [Air troubleshooting](use/air.md#troubleshooting)\n\n**Space**\n- \"No satellite data available\", positions look wrong, or a pass didn't tune: [Space troubleshooting](use/space.md#troubleshooting)\n\n**Sea**\n- \"No AISStream API key configured\" or \"AISStream rejected the API key\": [Sea troubleshooting](use/sea.md#troubleshooting)\n- No ships off grid, or a notice about the AIS receiver or decoder: [Sea troubleshooting](use/sea.md#troubleshooting)\n\n**Land**\n- LAND isn't in the menu, or APRS hears nothing: [Land troubleshooting](use/land.md#troubleshooting)\n\n**SDR**\n- The radio says **DISCONNECTED**, reads **RESERVED**, or a Sentry host won't connect: [Add a radio](use/sdr/add-a-radio.md#troubleshooting)\n- No sound, distorted sound, or only noise: [Listen to a frequency](use/sdr/listen.md#troubleshooting)\n- Record is greyed out, **COPYING IQ…** doesn't finish, or a recording is missing or failed: [Record what you hear](use/sdr/record.md#troubleshooting)\n- A decoder container doesn't start or can't reach the radio hub: [Install and run decoders](decoders.md#troubleshooting)\n\n**Everything off grid**\n- A blank map, an empty Air map, or old satellite positions: [Run Sentinel with no internet](tasks/no-internet.md#troubleshooting)\n\n**Radio host**\n- The radio hub on a second computer can't reach the main one: [Run the radios on a second machine](radio-host.md#troubleshooting)\n\n## Still stuck\n\nCollect the last few minutes of logs and report the problem on [GitHub](https://github.com/barrygee/Sentinel/issues):\n\n```bash\ndocker compose logs --since 15m > sentinel-logs.txt\n```\n\nCheck the file before you share it: it can include your addresses and the names of your radios.\n",lr="# Upgrade Sentinel\n\nUse this page to get the latest Sentinel. Most upgrades are two commands. A few changes need you to do something once by hand; they are listed under [One-off steps](#one-off-steps), newest first.\n\n## Before you start\n\n- Read what changed: [What's new](reference/whats-new.md).\n- Check the [one-off steps](#one-off-steps) for anything newer than your copy. If you don't know how old your copy is, `git log -1 --format=%cd` shows the date of the version you have.\n- If you'd like a way back, [back up your data](operations.md#back-up-a-volume) first.\n\n## Upgrade\n\n1. Get the new version, in the folder you installed Sentinel in:\n\n   ```bash\n   git pull\n   ```\n\n2. Rebuild and restart:\n\n   ```bash\n   docker compose up --build -d\n   ```\n\n   If you run decoders and haven't set `COMPOSE_PROFILES`, add your profiles, for example `docker compose --profile all up --build -d`.\n\n3. Reload Sentinel in your browser. If the page looks half old, half new, force a full reload: Ctrl+Shift+R (Cmd+Shift+R on macOS).\n\n4. Check that everything says **(healthy)**: `docker compose ps`.\n\nYour settings, recordings and other data are on Docker volumes, so they are kept. Database changes are made automatically when each service starts.\n\n## Go back to an older version\n\n```bash\ngit log --oneline            # find the version you want\ngit checkout <commit>\ndocker compose up --build -d\n```\n\nTo return to the latest version later, run `git checkout main && git pull`, then `docker compose up --build -d`.\n\nData you created on the newer version stays. If a [one-off step](#one-off-steps) says going back loses data, restore the backup you made before upgrading.\n\n## One-off steps\n\n### The radio hub is now called `radio` (October 2026)\n\nThe radio hub's container, volume and database were renamed from `radio-hub` to `radio`. Do this **before** you start the new version for the first time, or the hub starts with no Sentry hosts.\n\nFirst check you need it: `docker volume ls` lists a volume ending in `radio_hub_data`. If it doesn't, skip this step.\n\n1. Stop Sentinel (this keeps your data):\n\n   ```bash\n   docker compose down\n   ```\n\n2. Copy the hub's data into a volume with the new name, renaming its database files:\n\n   ```bash\n   docker volume create \\\n     --label com.docker.compose.project=sentinel \\\n     --label com.docker.compose.volume=radio_data \\\n     sentinel_radio_data\n   docker run --rm -v sentinel_radio_hub_data:/from -v sentinel_radio_data:/to alpine \\\n     sh -c 'cp -a /from/. /to/ && cd /to && for file in radio-hub.db*; do mv \"$file\" \"radio${file#radio-hub}\"; done'\n   ```\n\n   If your Sentinel folder isn't called `sentinel`, use its name in place of `sentinel` in the volume names and the first label.\n\n3. Move the old logins aside, so new ones are created in the new layout:\n\n   ```bash\n   docker run --rm -v sentinel_service_credentials:/credentials alpine \\\n     mv /credentials/services /credentials/services-old\n   ```\n\n4. In `.env`, rename `SENTINEL_RADIO_HUB_REPLICAS` to `SENTINEL_RADIO_REPLICAS`, if you have it.\n5. Upgrade as usual: `git pull`, then `docker compose up --build -d`.\n6. Check the hub's log: `docker logs sentinel-radio`. Core logs `registry: radio radio registered`.\n7. If you use a radio host, [export and import its credentials again](radio-host.md#changing-things-later). Credentials files in the old layout are refused.\n\nOnce it works, you can delete the old volume: `docker volume rm sentinel_radio_hub_data`.\n\n### Every section runs as its own service (October 2026)\n\nSentinel used to run as one container with one database. Each section, and the radio hub, now runs as its own service with its own database, and Sentinel only runs under Docker.\n\n- **Your data comes across by itself.** On its first start, each service copies its tables out of the old `sentinel.db` and logs `legacy import: copied N rows into …`. SDR also copies its recordings' files. The old copies stay where they were.\n- **Remove old `.env` lines.** These no longer do anything: `SENTINEL_EXTERNAL_SERVICES`, `SENTINEL_RADIO_HUB_HOST`, `SENTINEL_JOIN_TOKEN`, `SENTINEL_DECODER_SECRET`, and any section names in `COMPOSE_PROFILES` (keep the decoder profiles). Rename `NATS_SERVER_EXTRA_HOSTNAMES` to `SENTINEL_CORE_HOSTNAMES`.\n- **Remove old volumes**, after the first successful start:\n\n  ```bash\n  docker volume rm sentinel_nats_setup sentinel_join_token sentinel_decoder_secret\n  ```\n\n- **Going back** to a version before this change loses what you created since: data made by a section's own service is only in that service's volume.\n\n### Containers no longer run as root (October 2026)\n\nNothing to do on macOS or Windows: the first start hands the data volumes to Sentinel's own user. On Linux, if your user isn't 1000, set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` in `.env` to your ids (`id -u`, `id -g`), or Sentinel can't save the config file.\n",ur=`# Air: aircraft (ADS-B)

This page shows you how to watch aircraft near you, get alerts about them, and run Air with your own radio.

## What it's for

The **AIR** section shows aircraft near you on a live map. Most aircraft broadcast their position, height, speed and identity every second over a radio system called **ADS-B**. Use Air to:

- watch local air traffic, civil and military;
- get an alert when an aircraft declares an emergency, even when no browser has Sentinel open;
- get an alert when an aircraft flies over a place you care about;
- look up an airport and listen to its radio frequencies.

Online, the aircraft come from [adsb.lol](https://adsb.lol), a free community feed. Off grid, they come from your own radio.

## Start it

Air starts with the rest of Sentinel. To run it on its own:

\`\`\`bash
docker compose up -d gateway air
\`\`\`

## Before you start

- **Online:** an internet connection. Nothing else.
- **Off grid:** a radio on a Sentry host, an antenna for 1090 MHz, and the ADS-B decoder. See [Off grid](#off-grid).
- For alerts and range rings, set **Settings › App Settings › Sentinel Location** ([Quick start](../install.md#first-things-to-set)).

## Using it

### Watch local traffic

Open **AIR**. Sentinel shows the aircraft within about 250 nautical miles of the middle of the map, updated every few seconds. Move the map to look somewhere else.

Select an aircraft to see its **POSITION** (height, speed, heading, climb or descent) and **IDENTIFICATION** (type, registration, category and squawk code). From the details you can:

- **Track aircraft**: keep the map centred on it as it moves. It also appears under **TRACKING** in the sidebar.
- **Enable alerts**: get an alert when it lands or takes off.
- **Centre on map**: move the map to it once.

If an aircraft stops reporting, its details say **SIGNAL LOST**.

![An aircraft's details in the FILTER pane: POSITION and IDENTIFICATION, squawk 7700, and the track, alert and centre buttons beneath. The aircraft is highlighted in red on the map.](../images/air-aircraft-details.png)

### Find an aircraft, airport or base

Open **FILTER** in the sidebar and type a callsign, an ICAO address (the aircraft's unique code) or a squawk code. The buttons under **FILTER** choose what the map and list show: **ALL AIRCRAFT**, **CIVIL AIRCRAFT**, **MILITARY AIRCRAFT**, **AIRPORTS** or **MILITARY BASES**.

### Listen to an airport

Select an airport. Its details list its **FREQUENCIES** (tower, approach and so on). Select one to tune your radio to it in AM, ready to listen. You need a radio set up in the SDR section; see [Add a radio](sdr/add-a-radio.md).

### Get alerted to emergencies

Aircraft in trouble set their transponder to an emergency **squawk** code:

| Code | Meaning |
|---|---|
| 7700 | General emergency |
| 7600 | Radio failure |
| 7500 | Hijacking or unlawful interference |

Sentinel raises an alert for every aircraft that sets one of these codes, and highlights the aircraft on the map. It keeps checking when no browser has the AIR map open: every 20 seconds it looks for emergencies within 250 nautical miles of your **Sentinel Location** (off grid, of your receiver). The alert waits for you under **ALERTS**. [Get alerted to aircraft emergencies](../tasks/aircraft-emergency-alerts.md) sets this up from start to finish.

### Get alerted to aircraft overhead

**Settings › AIR › Overhead Aircraft Alerts** alerts you when an aircraft comes within a distance of a place: your **Sentinel Location** or any Sentry host's location. Choose civil aircraft, military aircraft or both for each place.

### Map layers

The map controls on the right turn layers on and off: **RANGE RING** (distance circles around your location), **A2A REFUELING** (air-to-air refuelling areas), **AWACS** (surveillance aircraft orbits) and **TERRAIN** (hills and contours). **MAP LAYERS** has the rest. **Settings › AIR › Map Layers** chooses which are on when the map opens.

## Off grid

With no internet, Air reads aircraft from your own radio. It needs:

- an RTL-SDR dongle and a 1090 MHz antenna on a **Sentry host** (a Raspberry Pi running Sentry, which shares its dongles over your network);
- the ADS-B decoder, started with \`docker compose --profile adsb up -d --build\`;
- a fast local network: the radio's raw signal uses about 38 Mbps the whole time Air is open.

Then:

1. Add the Sentry host under **Settings › SDR › Sentry Hosts** ([Add a radio](sdr/add-a-radio.md#add-a-sentry-host)).
2. Pick its dongle in **Settings › AIR › Off Grid ADS-B SDR**.
3. Switch to **OFF GRID** (all of Sentinel in **Settings › App Settings › Connectivity Mode**, or only Air in **Settings › AIR › Source Override**), then select **APPLY CHANGES**.
4. Open **AIR**. Sentinel claims the dongle, tunes it to 1090 MHz and shows the aircraft around the receiver.

The dongle is held for Air while the map is open and released when you close it. More detail is in [Install and run decoders](../decoders.md).

## Settings

All under **Settings › AIR**:

| Setting | What it does | When to change it |
|---|---|---|
| **Source Override** | Uses **ONLINE** or **OFF GRID** for Air only, whatever the rest of Sentinel uses. | When Air should use your own radio while other sections stay online, or the other way round. |
| **Off Grid ADS-B SDR** | The Sentry dongle that receives aircraft off grid. | When you set up off-grid Air or move the dongle. |
| **Off Grid Squawk Checks** | Seconds between background checks for emergencies off grid, while no AIR map is open. Default 20. | Raise it to put less load on the radio host. |
| **Online Data Source** | The online feed of aircraft. Default \`https://api.adsb.lol/v2\`. | Only if you use another feed with the same format. |
| **Online Squawk Checks** | Seconds between background checks for emergencies online, while no AIR map is open. Default 20. | Raise it to use less internet. |
| **Map Layers** | Which layers the map draws when it opens. | To change what you see by default. |
| **Overhead Aircraft Alerts** | Places to watch for aircraft overhead, and how close counts. | To be told when something flies over. |
| **Label Data Points** | What each aircraft's label on the map shows. | To show more or less on the map. |

## Troubleshooting

- **The map is empty off grid.** The notice at the top of the map says why. Check that a dongle is chosen in **Off Grid ADS-B SDR** and that the decoder is running (\`docker compose --profile adsb ps\`). If the decoder log says it is streaming but accepts 0 messages, the problem is the antenna or signal, not Sentinel.
- **"No data source configured."** Air is online but **Online Data Source** is empty. Put the default back, or switch to **OFF GRID**.
- **No emergency alerts when the map is closed.** Check that **Sentinel Location** is set (online) or that **Off Grid ADS-B SDR** is set (off grid), and that the \`air\` service is running.
- **AIR is greyed out.** The Air service has stopped. Run \`docker compose ps air\` and \`docker compose logs air\`.
`,dr=`# Alerts

Alerts tell you when something you care about happens, in any section, while you are looking at another. This page covers what raises an alert, where to find them, and how to turn them off.

## What raises an alert

| Alert | Raised when | Turn it on |
|---|---|---|
| Aircraft emergency | An aircraft squawks 7700, 7600 or 7500. Raised even when no browser has Sentinel open. | Always on. See [Air: Get alerted to emergencies](air.md#get-alerted-to-emergencies). |
| Aircraft landing and departure | An aircraft you chose lands or takes off. | **Enable alerts** in the aircraft's details. |
| Aircraft overhead | A civil or military aircraft comes close to your location or a Sentry site. | **Settings › AIR › Overhead Aircraft Alerts**. |
| Satellite pass | A satellite you chose rises in about five minutes. | **Enable pass alerts** on a pass. See [Space](space.md#get-an-alert-before-a-pass). |
| Auto-tune | Your radio retuned for a satellite pass, or couldn't. | **Auto-tune SDR** on a pass. |
| Tracking | You started or stopped following an aircraft or satellite. | Happens when you track something. |

## Where alerts show

Alerts collect under **ALERTS** in the sidebar, newest first. The **ALERTS** button pulses when there is one you haven't seen. Turn on **Settings › App Settings › Alert Sound** to hear a sound as well.

![The ALERTS pane: an aircraft emergency marked EMERGENCY in red at the top, a satellite pass notice below it, each with a dismiss button, and CLEAR at the bottom.](../images/alerts-pane.png)

Sentinel keeps your alerts, so one raised while no browser was open is waiting when you next open it.

## Go to what an alert is about

Select an alert to go to its subject: an aircraft alert opens **AIR** and centres the map on the aircraft; a satellite alert opens **SPACE** on the satellite.

## Dismiss or turn off alerts

Each alert has a button on its right:

- **Dismiss** (✕) removes that one alert.
- **Disable alerts** (the crossed-out bell) removes it and stops alerts of that kind for that aircraft or satellite.
- **Disable autotune** (✕ on an auto-tune alert) cancels auto-tune for that satellite.

**Clear alerts** at the bottom of the list removes them all.

To see and turn off every alert you have set up in one place, open **Settings › App Settings › Alerts**. It lists each aircraft, satellite and overhead area you get alerts for, with a switch for each.
`,fr=`# Edit the config file

Every setting in Sentinel is also kept in one file, \`sentinel_config.json\`. Use it to change many settings at once, to copy settings to another Sentinel, or to change a setting that has no control in Settings yet, such as [switching Land on](land.md#switch-land-on).

## Where the file is

On the computer running Sentinel, in the folder you installed it in:

\`\`\`text
backend/data/sentinel_config.json
\`\`\`

It is a live copy. Whenever a setting changes, in Settings or anywhere else, Sentinel rewrites the file within a second.

## Edit it by hand

1. Open \`backend/data/sentinel_config.json\` in a text editor.
2. Change what you need and save the file.

Sentinel notices the saved file within a second or two and applies it. Open browsers update in place, with no reload.

If the file isn't valid (a missing comma, say, or a value of the wrong kind), Sentinel ignores it and logs why in the app's log (\`docker compose logs app\`). Your running settings don't change, and the next change made in Settings overwrites the broken file, so fix it promptly.

## Edit it in Settings

You can make the same edits from the browser, which suits a machine you can't sit at:

1. Open **Settings › App Settings › Application Config** and select **EDIT**. The whole file appears as text.
2. Make your changes.
3. Select **APPLY CHANGES**.

**EXPORT** downloads the file.

## Copy settings to another Sentinel

1. On the first Sentinel, select **EXPORT** under **Application Config** (or use **Export All Configuration** to include frequencies and the band plan).
2. On the other Sentinel, open **Application Config**, select **EDIT**, replace the text with the exported file's contents, and select **APPLY CHANGES**. Or replace its \`backend/data/sentinel_config.json\` with the exported file.

Frequencies and the band plan load the same way, from **Settings › SDR › Frequencies & Groups (JSON)** and **Band Plan (JSON)**.

## What the file looks like

The file has one block per part of Sentinel: \`app\` for the whole app, then \`air\`, \`space\`, \`sea\`, \`land\` and \`sdr\`. Each block holds that part's settings as \`"name": value\`. This is the start of a fresh install's file (the full set of defaults is \`backend/default_config.json\` in the code):

\`\`\`json
{
  "app": {
    "connectivityMode": "online",
    "location": { "latitude": "", "longitude": "" },
    "rangeRingOrigin": { "kind": "user", "sentryHostId": null },
    "notificationSound": false,
    "mapTheme": "dark",
    "mapLayers": { "roads": false, "names": false, "borders": true, "terrain": false }
  },
  "air": {
    "enabled": true,
    "sourceOverride": "online",
    "onlineDataSourceURL": "https://api.adsb.lol/v2",
    "squawkWatchOnlineIntervalSec": 20,
    "offgridSdrSource": null,
    "squawkWatchOffgridIntervalSec": 20,
    "overheadAlerts": { "civil": false, "mil": false, "radiusNm": 10 }
  },
  "sea": {
    "enabled": true,
    "sourceOverride": "online",
    "aisBoundingBoxes": [[[-90, -180], [90, 180]]],
    "aisSdrRadioId": null
  },
  "land": {
    "enabled": false,
    "aprsChannelHz": 144800000,
    "aprsRetentionMinutes": 5
  },
  "sdr": {
    "recordRawIq": false,
    "recordingMaxDurationMinutes": 360,
    "recordingsFolder": "",
    "radios": [],
    "aprs_radio_id": null,
    "ais_radio_id": null
  }
}
\`\`\`

The real file has more keys in each block (labels, layers and so on); the ones above are those you are most likely to change.

| Key | Values |
|---|---|
| \`app.connectivityMode\`, \`<section>.sourceOverride\` | \`"online"\` or \`"offgrid"\` |
| \`app.location\` | \`latitude\` and \`longitude\` as decimal degrees, both set or both empty |
| \`app.mapTheme\` | \`"dark"\` or \`"light"\` |
| \`<section>.enabled\` | \`true\` or \`false\`: whether the section appears |
| \`sea.aisBoundingBoxes\` | A list of boxes, each \`[[south, west], [north, east]]\` |
| \`sea.aisSdrRadioId\`, \`sdr.aprs_radio_id\`, \`air.offgridSdrSource\` | The \`id\` of a radio in \`sdr.radios\`, or \`null\` for none |
| \`land.aprsChannelHz\` | A frequency in hertz: \`144800000\` is 144.800 MHz |

## Example changes

You don't have to send the whole file. In **Application Config**, a document with only some keys changes only those keys and leaves everything else as it is. Each key you send is replaced as a whole, though: to change one field of a nested value such as \`"overheadAlerts"\` or \`"location"\`, send all of its fields. Paste one of these in place of the text, then select **APPLY CHANGES**.

**Set your location and take everything off grid:**

\`\`\`json
{
  "app": {
    "location": { "latitude": 51.5072, "longitude": -0.1276 },
    "connectivityMode": "offgrid"
  },
  "air": { "sourceOverride": "offgrid" },
  "space": { "sourceOverride": "offgrid" },
  "sea": { "sourceOverride": "offgrid" }
}
\`\`\`

**Switch Land on, for North America's APRS channel:**

\`\`\`json
{
  "land": { "enabled": true, "aprsChannelHz": 144390000 }
}
\`\`\`

**Receive ships only around Great Britain and Ireland:**

\`\`\`json
{
  "sea": { "aisBoundingBoxes": [[[49.5, -11.0], [61.0, 2.5]]] }
}
\`\`\`

**Add two rtl_tcp radios.** Sentinel gives each one an \`id\` when it is saved; look them up afterwards in **Settings › SDR › SDR Devices** or in the file. Sending \`radios\` replaces the whole list, so include any radios you already have:

\`\`\`json
{
  "sdr": {
    "radios": [
      { "name": "Roof RTL-SDR", "host": "192.168.1.45", "port": 1234, "enabled": true },
      { "name": "Marine RTL-SDR", "host": "192.168.1.46", "port": 1234, "enabled": true }
    ]
  }
}
\`\`\`

**Use radio 2 for AIS and save recordings into a subfolder.** After adding the two radios above to an empty list, they have ids 1 and 2:

\`\`\`json
{
  "sea": { "aisSdrRadioId": 2 },
  "sdr": { "recordingsFolder": "marine", "recordRawIq": true }
}
\`\`\`

If a document is invalid, nothing in it is saved: for example a \`location\` with only a latitude, or a latitude above 90.

## What isn't in the file

Secrets are never written to the file: the AISStream key is kept out of it and out of every export. Set it again on each Sentinel under **Settings › SEA › AIS Data API Key**.

Saved frequencies, groups, search ranges, the band plan and satellite frequencies aren't in this file either: they have their own JSON editors in Settings (see [Save and scan frequencies](sdr/frequencies.md#edit-many-at-once)).

Settings in \`.env\`, such as the recordings root, are not in this file either. They are about how Sentinel runs on that computer, and need a restart to change. [Environment variables](../configuration.md#example-env-files) has example \`.env\` files.
`,pr=`# Find your way around the screen

Every section uses the same layout, so once you know it in one you know it in all of them. This page names each part and says what it is for.

![The Air section: the section menu across the top, the sidebar rail and FILTER list on the left, the map in the middle with aircraft DEMO303 shown in red because it is squawking 7700, the map controls on the right, and the footer with the gear for Settings.](../images/interface-air-screen.png)

## The parts of the screen

1. **Section menu** (top right): **AIR**, **SPACE**, **SEA**, **LAND** and **SDR**. Select one to open its map or screen. A greyed-out entry is a section that has stopped running; the others keep working.
2. **Sidebar** (left): a narrow rail of buttons that open panes beside the map.
   - **FILTER** searches what is on the map and lists it, for example aircraft by callsign or satellites by name. While it is open, buttons below it choose what the map shows, such as **CIVIL AIRCRAFT** or **REPEATERS**. The list is also a way to read the map without seeing it.
   - **ALERTS** lists things Sentinel has told you about, such as an aircraft emergency or a satellite about to rise. The button pulses when there is one you haven't seen. See [Alerts](alerts.md).
   - **TRACKING** lists the aircraft and satellites you are following.
   - Some sections add their own button, such as **PASSES** in Space.
3. **Map** (middle): the live picture. Select something on the map to see its details.
4. **Map controls** (right edge, on the Air, Space, Sea and Land maps): zoom, **GO TO MY LOCATION**, and buttons that turn map layers on and off, such as **RANGE RING** or **TERRAIN**. Hover over or focus a button to see its name.
5. **Footer** (bottom):
   - the button at the left opens and closes the sidebar;
   - while a radio is playing, the frequency it is tuned to shows at the right, on every section;
   - the gear opens **Settings**;
   - the button at the far right opens and closes the map controls.
6. **Settings** fills the screen and has its own menu: **App Settings** for the whole app, then one entry per section. **Docs**, at the bottom of that menu, opens this documentation. Closing Settings or Docs takes you back to the section you came from.

## Using the keyboard

- Press **Tab** to move between controls and **Shift+Tab** to go back. The first **Tab** on a page offers **Skip to main content**.
- Press **Enter** or **Space** to use the focused button.
- Press **Escape** to close Settings, Docs or an open menu.
- In a group of options, such as the radio modes, use the arrow keys to move between them.

## On a phone

The layout adapts to a small screen:

![Sentinel on a phone: the section menu is behind the three-line button at the top right, and the map fills the screen.](../images/interface-phone.png)

- The section menu moves behind the menu button (three lines) at the top right. **SETTINGS** is at the bottom of that menu.
- Sidebar panes open over the map, with a close button.
- The SDR radio panel scrolls if your screen is too short to show it all.

## Docs

These docs are part of Sentinel, so they work with no internet. Search at the top of the docs finds any word on any page; pages with more of your words come first.
`,mr=`# Land: repeaters and APRS

## What it's for

The **LAND** section is for radio amateurs. It has two map layers, shown one at a time:

- **REPEATERS**: every UK amateur radio repeater, from the [ukrepeater.net](https://ukrepeater.net/) directory, with its frequencies, modes and access tones. Select a frequency to listen to it.
- **APRS STATIONS**: stations your own radio hears on APRS (the Automatic Packet Reporting System), a radio network amateurs use to share positions, weather and short messages.

Use Land to find the repeaters you can reach, plan a route through repeater coverage, listen to a local repeater, or see who is active on APRS around you.

## Start it

Land starts with the rest of Sentinel, but it is **switched off** until you [switch it on](#switch-land-on). To run its service on its own:

\`\`\`bash
docker compose up -d gateway land
\`\`\`

APRS also needs the radio hub and the APRS decoder:

\`\`\`bash
docker compose --profile aprs up -d --build
\`\`\`

## Before you start

- **Repeaters:** nothing. The directory updates itself daily when online, and a built-in copy works offline.
- **APRS:** an RTL-SDR dongle you can give to APRS full time, a 2 m antenna, and the APRS decoder. See [Hear APRS stations](#hear-aprs-stations).

## Using it

### Switch Land on

Land has no on/off switch in Settings yet. Switch it on in the configuration:

1. Open **Settings › App Settings › Application Config** and select **EDIT**. The configuration appears as text.
2. In the text, find the line \`"land": {\`. A line or two below it is:

   \`\`\`json
   "enabled": false,
   \`\`\`

   Change \`false\` to \`true\`, keeping the comma.
3. Select **APPLY CHANGES**.

**LAND** appears in the section menu. If it doesn't, reload the page. You can also make the same change in the config file; see [Edit the config file](config-file.md).

### Find a repeater

Open **LAND**. The map shows the repeaters. Open **FILTER** in the sidebar to search by callsign, town, band or mode, and use the **Band**, **Mode** and **Status** filters to narrow the list, for example to 2 m FM repeaters that are on air.

Select a repeater to see its **SITE** (location, Maidenhead locator, region and the keeper who looks after it) and each of its channels: **OUTPUT** and **INPUT** frequencies, **OFFSET**, the access tone or colour code (**CTCSS / CC**), **STATUS**, aerial **HEIGHT**, power (**ERP**) and **MODES**.

![A repeater's details: SITE information, then its 2 m channel with OUTPUT and INPUT frequencies (each with a save button), offset, CTCSS tone, status, height, power and mode.](../images/land-repeater-details.png)

### Listen to a repeater

Select a repeater's **OUTPUT** frequency. Your radio tunes to it in the right mode and starts playing. Select **SAVE FREQUENCY** to add it to your saved frequencies in the SDR section. You need a radio set up; see [Add a radio](sdr/add-a-radio.md). [Find and listen to a local repeater](../tasks/listen-to-a-repeater.md) goes through it step by step.

### Hear APRS stations

1. Start the APRS decoder: \`docker compose --profile aprs up -d --build\`.
2. Pick the radio in **Settings › LAND › Off Grid APRS SDR** and select **APPLY CHANGES**. That radio is now kept for APRS and can't be used in the SDR section.
3. Open **LAND** and choose **APRS STATIONS** under **FILTER**. Until a radio is set, this button reads **APRS STATIONS — NO SDR SET**.

Stations appear as the radio hears them, with their APRS symbol. Select one to see its details; **RAW** shows the packet exactly as it was received. Decoding carries on in the background with no browser open, and starts again after a restart.

## Off grid

Land works fully off grid. The repeater directory falls back to the copy built into Sentinel, and APRS comes from your own radio in any case.

## Settings

All under **Settings › LAND**:

| Setting | What it does | When to change it |
|---|---|---|
| **Off Grid APRS SDR** | The radio that decodes APRS. Until one is set, the APRS layer is off. | When you set up APRS. |
| **APRS Channel** | The frequency the APRS radio is kept on. Default 144.800 MHz (Europe and the UK); use 144.390 MHz in North America. If anything moves the radio, it retunes itself here. | When you are outside Europe. |
| **APRS Label Fields** | What each station's label on the map shows. | To show more or less on the map. |
| **APRS Retention** | Minutes a station stays on the map after it was last heard. Default 5. | Raise it to see quieter stations for longer. |
| **Repeater Label Fields** | What each repeater's label shows. | To show more or less on the map. |
| **Repeater Directory (JSON)** | The repeater directory itself. You can edit or replace it; a replacement is kept for 30 days before the daily update starts again. | To correct an entry or load your own list. |

## Troubleshooting

- **LAND isn't in the menu.** It is switched off; see [Switch Land on](#switch-land-on).
- **APRS STATIONS can't be selected.** No radio is set in **Off Grid APRS SDR**.
- **APRS hears nothing.** Check that the decoder is running (\`docker compose --profile aprs ps\`) and that the radio is on the APRS channel: a satellite auto-tune can move it, and it moves back within about 15 seconds. To check, find the radio's \`id\` with \`curl -s http://localhost:8080/api/sdr/radios\`, then run \`curl -s http://localhost:8080/api/sdr/aprs/status/<id>\`: \`"on_channel": false\` means it is off the channel. Also check the antenna suits 2 m.
- **A repeater's details look out of date.** Online, the directory updates daily. Offline, it is the built-in copy from when your version of Sentinel was made.
`,hr=`# Change the map look

Every map in Sentinel shares the same base map and the same look settings. This page covers the map style, what the base map draws, terrain, range rings and Sentry sites.

## Light or dark

**Settings › App Settings › Map Style** chooses the palette of every map:

- **DARK**: a dim map that keeps aircraft, ships and labels clearly visible, and is kind to your eyes at night.
- **LIGHT**: OpenStreetMap's familiar colours, clearer in daylight.

The rest of Sentinel stays dark either way.

## What the base map shows

**Settings › App Settings › Map Layers** turns parts of the base map on and off for every section: **Roads**, **Location names** and **Borders**. Fewer layers leave busy maps less cluttered.

Each section has its own layers too (aircraft labels, ports, range rings and so on), in its own settings and in the map controls on the right of its map.

## Terrain

**TERRAIN** in the map controls draws hill shading and contour lines, so you can see high ground at a glance: useful for judging radio line of sight. It is greyed out, with **TERRAIN — TILES NOT INSTALLED**, until terrain data is available: download it for your area in [Download maps for offline use](offline-maps.md).

## Range rings

**RANGE RING** draws circles at set distances from a point, to judge how far away things are. **Settings › App Settings › Range Ring Origin** chooses the point: your **Sentinel Location**, or the location of one of your Sentry hosts.

## Sentry sites

If you have Sentry hosts with a location set, they are marked on the maps. Use them as range-ring centres, and as places to watch for aircraft overhead (**Settings › AIR › Overhead Aircraft Alerts**).
`,gr=`# Download maps for offline use

Online, Sentinel draws its maps from the internet. To keep the maps working with no internet, download the area you need while you still have a connection. This page shows you how, and how much space it takes.

> [!IMPORTANT]
> Download your maps **before** you go off grid. Downloading needs an internet connection, so it is turned off while Sentinel is in **OFF GRID** mode.

## Download an area

1. Open **Settings › App Settings › Offline Maps**.
2. Choose the area in one of these ways:
   - select **DRAW AREA** and drag a rectangle on the small map;
   - move the small map to your area and select **USE CURRENT VIEW**;
   - type the **NORTH**, **SOUTH**, **EAST** and **WEST** edges in decimal degrees.

   Drag the rectangle's corners or edges to adjust it. **CLEAR AREA** starts again.

   ![Settings › App Settings › Offline Maps: a small world map to choose the area on, with DRAW AREA and USE CURRENT VIEW beneath.](../images/settings-offline-maps.png)
3. Choose the **DEPTH**: how far you can zoom in offline, from 6 (whole countries) to 14 (individual streets). Each step deeper can take up to four times the space.
4. Tick what to download: **Basemap** (land, roads, places, borders) and **Terrain** (hills and contour lines). Both are ticked to start with.
5. Check the estimate. It shows the size, the number of tiles and the **Free space** on the computer running Sentinel. If the download won't fit, **DOWNLOAD** is turned off.
6. Select **DOWNLOAD**.

The download runs on the Sentinel computer, so you can close Settings or the browser while it runs. One download runs at a time; others wait as **QUEUED**. **CANCEL** stops one.

When it finishes, the area appears in the list below with its size and date. Maps of that area now work offline, in both **DARK** and **LIGHT** map styles, and **TERRAIN** works there too.

## How much space it takes

Size depends on the area and depth, and on how much is in it: a city takes far more than the same area of sea. Go by the estimate, which is worked out for your exact area before you download. To keep downloads small, choose a large area at a low depth for the region and a small area at a high depth for where you are. Terrain stops adding detail at depth 12, so above that only the basemap grows.

## Remove an area

Select the delete button next to an area in the list. Its files are deleted straight away.

## Use the offline maps

Switch to **OFF GRID** in **Settings › App Settings › Connectivity Mode** and select **APPLY CHANGES**. The maps then come from your downloaded areas, newest first. Outside them the map is blank.

[Run Sentinel with no internet](../tasks/no-internet.md) puts this together with the rest of the off-grid set-up.

## Where the maps are stored

Downloaded areas are kept on the Sentinel computer, in the \`sentinel_db\` Docker volume, so they survive restarts and upgrades. You don't need to restart anything after a download.

## Advanced: install a base map by hand

As well as downloaded areas, Sentinel can use a **base archive**: [PMTiles](https://protomaps.com) files placed in \`frontend/assets/tiles/\`. They are used wherever no downloaded area covers the map. You might do this to prepare a machine before it goes somewhere with no internet. You need the \`pmtiles\` program:

\`\`\`bash
brew install pmtiles    # or a binary from https://github.com/protomaps/go-pmtiles/releases
\`\`\`

Then cut the files you want. \`--bbox\` is \`west,south,east,north\`; add \`--dry-run\` to see the size first. Replace \`YYYYMMDD\` with the date of a current build listed at [build.protomaps.com](https://build.protomaps.com):

\`\`\`bash
mkdir -p frontend/assets/tiles
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
pmtiles extract https://download.mapterhorn.com/planet.pmtiles frontend/assets/tiles/uk-terrain.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=12
\`\`\`

| File | What it covers |
|---|---|
| \`surroundings.pmtiles\` | The whole world, zoom 0 to 6 |
| \`uk.pmtiles\` | Your region in detail, zoom 0 to 14 (the example is the UK) |
| \`uk-terrain.pmtiles\` | Terrain for your region, for **TERRAIN** |

## About the map data

Downloaded basemaps are cut from the newest [Protomaps](https://protomaps.com) world build, which Sentinel finds by itself. Protomaps deletes each dated build after about a week, so there is nothing to keep up to date. Terrain comes from [Mapterhorn](https://mapterhorn.com). The \`.env\` settings \`OFFLINE_BASEMAP_SOURCE_URL\` and \`OFFLINE_TERRAIN_SOURCE_URL\` change these sources; you rarely need them.

The offline map data has no national park boundaries, so the offline styles draw them from a file built into Sentinel, \`frontend/assets/national-parks.geojson\`: the 15 national parks of Great Britain, from the ONS _National Parks (December 2022) Boundaries GB BGC_. Source: Office for National Statistics, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); contains OS data © Crown copyright and database right 2022.
`,_r=`# Receiving responsibly

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
`,vr=`# Add a radio

## What it's for

The **SDR** section turns a cheap USB radio, an **RTL-SDR dongle**, into a wide-band receiver you control from the browser. With a radio added you can:

- see a live picture of a whole band at once: the **spectrum** (signal strength across the band) and the **waterfall** (the same over time, scrolling down);
- tune to any signal and listen ([Listen to a frequency](listen.md));
- save, sort and scan frequencies ([Save and scan frequencies](frequencies.md));
- record what you hear ([Record what you hear](record.md));
- decode digital voice, APRS, AIS and ADS-B ([Decode digital signals](decode.md));
- let other sections use it: tune to an airport, a port or a repeater with one click, or follow a satellite pass.

In these docs, a **radio** is one dongle you have added to Sentinel; **dongle** means the physical USB stick. Sentinel reaches each dongle over your network, so the dongle can sit next to the antenna on another computer, such as a Raspberry Pi.

## Start it

SDR starts with the rest of Sentinel. To run it on its own, start it with the **radio hub**, the service that talks to your radios:

\`\`\`bash
docker compose up -d gateway sdr radio
\`\`\`

Without the radio hub you can still see your saved frequencies and recordings, but not the waterfall or audio.

## Before you start

You need:

- an RTL-SDR dongle and an antenna for the band you want to hear;
- a computer the dongle is plugged into, on the same network as Sentinel (it can be the same computer);
- that computer sharing the dongle in one of two ways:
  - **rtl_tcp**, a small program that comes with the RTL-SDR drivers. Start it with \`rtl_tcp -a 0.0.0.0 -p 1234\`. Use this for a single dongle.
  - **Sentry**, which runs on a Raspberry Pi and shares several dongles. Sentinel can claim a Sentry dongle, tune it and hand it back, which off-grid Air needs.

Each dongle serves one program at a time. If another program (or another Sentinel) is connected to it, Sentinel can't use it.

## Add an rtl_tcp radio

1. Open **Settings › SDR › SDR Devices** and select **+ ADD SDR**.
2. Fill in:
   - **NAME**: a name you'll recognise, such as \`Roof RTL-SDR\`;
   - **IP ADDRESS**: the address of the computer running \`rtl_tcp\`;
   - **PORT**: the port \`rtl_tcp\` listens on, usually \`1234\`.
3. Leave **STATUS** on **ENABLED** and select **SAVE**.

![The add-radio form in Settings › SDR › SDR Devices, with NAME, IP ADDRESS, PORT and STATUS, and CANCEL and SAVE buttons.](../../images/settings-add-radio.png)
4. Open **SDR** and pick the radio from the list at the top of the radio panel. It shows **CONNECTED** when Sentinel reaches it, and the waterfall starts.

## Add a Sentry host

1. Open **Settings › SDR › Sentry Hosts** and select **+ ADD SENTRY**.
2. Fill in its **IP ADDRESS**, a **LABEL** (such as \`Roof Pi\`), its **PORT** (usually \`8000\`) and its **CONSOLE PASSWORD**.
3. Select **SAVE**. Sentinel connects and lists the host's dongles under **Settings › SDR › SDR Devices**.
4. Add each dongle you want to use from that list. For a Sentry dongle you can also set its **OUTPUT PORT**, its **ANTENNA** and **NOTES**. Sentry keeps these, so they are the same in every program that uses it.

## The radio panel at a glance

When you open **SDR**, the radio panel on the left has five tabs:

| Tab | What it's for |
|---|---|
| **RADIO** | Choosing a radio, tuning, listening and recording. Also **FAVOURITES**, **SCANNER** and **SEARCH**. |
| **FREQUENCY MANAGER** | Your saved frequencies. |
| **GROUPS** | Colour-coded groups to sort saved frequencies. |
| **SEARCH RANGES** | Saved ranges to sweep for signals. |
| **RECORDINGS** | Playing, downloading and deleting recordings. |

The spectrum and waterfall fill the rest of the screen.

## Settings

All under **Settings › SDR**:

| Setting | What it does | When to change it |
|---|---|---|
| **Sentry Hosts** | The Sentry hosts Sentinel connects to, with their status. | When you add or move a Sentry host. |
| **SDR Devices** | Your radios. | When you add, rename or remove a radio. |
| **SDR Options** | How the waterfall and recordings behave. See [Listen to a frequency](listen.md#settings) and [Record what you hear](record.md#settings). | — |
| **Frequencies & Groups (JSON)** | Every saved frequency, group and search range in one file. | To edit many at once, or copy them to another Sentinel. |
| **Band Plan (JSON)** | The coloured strip of bands shown along the waterfall. | To match your country's band plan. |

## Troubleshooting

- **The radio says DISCONNECTED.** Check that \`rtl_tcp\` (or Sentry) is running, that the address and port are right, and that nothing else is connected to the dongle.
- **It connects, then drops, with "USB buffer" errors on a Linux radio computer.** Raise the Linux USB memory limit. As root on that computer: \`echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb\`.
- **A Sentry host won't connect.** In the radio hub log (\`docker compose logs radio\`), a refused login means the console password is wrong.
- **A radio in the list reads RESERVED and can't be picked.** It is held for a decoder (APRS, AIS or ADS-B) chosen in another section's settings. Choose a different radio there to free it.
- **No waterfall or sound at all, but saved frequencies show.** The radio hub isn't running: \`docker compose up -d radio\`.
`,yr=`# Decode digital signals

This page is about using decoders. To install them, see [Install and run decoders](../../decoders.md).

A **decoder** turns a digital radio signal into something you can read or hear: voice, ship and aircraft positions, or packet messages. Each decoder runs alongside Sentinel as its own optional service, and each one needs **its own dongle** while it runs.

## Which decoder does what

| Decoder | What you get | Where it shows | Start it from |
|---|---|---|---|
| **Digital voice** | Speech and call details from DMR, P25, NXDN, D-STAR, YSF and M17 radio | The SDR radio panel | The **DMR** button in the SDR radio panel (it decodes all these modes, not only DMR) |
| **APRS** | Positions, weather and messages from radio amateurs | The Land map | **Settings › LAND › Off Grid APRS SDR** |
| **AIS** | Ship positions, with no internet | The Sea map | **Settings › SEA › Off Grid AIS SDR**, then Sea off grid |
| **ADS-B** | Aircraft positions, with no internet | The Air map | **Settings › AIR › Off Grid ADS-B SDR**, then Air off grid |

Each decoder must be installed before it can be started; [Install and run decoders](../../decoders.md) has the commands.

## Decode digital voice

1. Install the voice decoder: \`docker compose --profile voice-decoder up -d --build\`. The first build takes several minutes.
2. In **SDR**, tune to a digital voice channel and select **Tune** (▶).
3. Under **CONTROLS › DIGITAL MODE**, select **DMR**. The decoder opens below the waterfall.

Call details (talk group, radio ID and so on) appear in the decoder panel as calls come in, and the voice plays. Before a call starts, the decoder shows no sync; that is expected. Select **DMR** again to stop decoding and hide the panel. Despite its label, the button decodes every mode in the table above.

Turn on **Settings › SDR › SDR Options › Mute Audio While Decoding** if the raw digital noise under the decoded voice bothers you.

## Decode APRS, AIS and ADS-B

These three decoders work for another section, so you start them from that section's settings, not from the SDR panel. Once started, APRS and AIS keep the dongle tuned to their channel, and keep decoding in the background with no browser open, even after a restart. ADS-B holds its dongle while the Air map is open.

- APRS: see [Land: Hear APRS stations](../land.md#hear-aprs-stations).
- AIS: see [Track ships off grid with your own radio](../../tasks/track-ships-off-grid.md).
- ADS-B: see [Air: Off grid](../air.md#off-grid).

A dongle held by one of these decoders reads **RESERVED** in the SDR radio panel and can't be tuned there, so the decoder isn't knocked off its channel.

## Why each decoder needs its own dongle

A dongle can only listen to one slice of the band at a time, and each decoder needs a particular channel: 144.800 MHz for APRS in Europe, 161.975 and 162.025 MHz for AIS, 1090 MHz for ADS-B. So running all four decoders at once needs four dongles. With one dongle, run one decoder at a time.
`,br=`# Save and scan frequencies

Save the frequencies you listen to, sort them into groups, and let Sentinel scan them or sweep a range for activity. You need a radio added first; see [Add a radio](add-a-radio.md).

## Save a frequency

1. In the SDR radio panel, open the **FREQUENCY MANAGER** tab.
2. Under **ADD FREQUENCY**, fill in a **LABEL** (such as \`Local repeater\`), the **FREQ (MHz)** and the **MODE**.
3. Tick any **GROUPS** it belongs to, and add **NOTES** if you like.
4. Select **SAVE**.

It is marked on the waterfall from then on. Select **Tune to** next to any saved frequency to listen to it. Other sections can save frequencies here too, such as **SAVE FREQUENCY** on a Land repeater.

Mark a frequency as a **Favourite** (the star) to add it to **FAVOURITES** on the **RADIO** tab, for one-click tuning.

## Sort frequencies into groups

Groups keep related frequencies together, such as "Airband" or "Marine", and give them a colour on the waterfall.

1. Open the **GROUPS** tab.
2. Type a group name and select **ADD**.
3. Rename or delete a group with the buttons beside it. Deleting a group doesn't delete its frequencies.

To show only some groups in the frequency list, choose them in the group filter at the top of **FREQUENCY MANAGER**.

## Scan saved frequencies

The scanner steps through your saved frequencies and stops on any that has a signal, like a handheld scanner.

1. On the **RADIO** tab, open **SCANNER**.
2. Choose **All**, or select the groups to scan.
3. Set **SQUELCH** (under **CONTROLS**) a little above the noise. The scanner treats anything louder than the squelch as a signal.
4. Select **Start scan**. The header reads **SCANNING**.

When it finds a signal it stops there and reads **SCANNING PAUSED** while you listen. When the signal ends, it carries on. Select **Stop scan** to stop.

**Settings › SDR › SDR Options › Scan / Search Resume Delay (Seconds)** sets how long it waits after a signal ends before moving on. Raise it to hear replies in a conversation.

## Search a range for activity

A search sweeps every step between two frequencies, looking for signals you haven't saved.

1. On the **RADIO** tab, open **SEARCH**.
2. Enter **LOW (MHz)**, **HIGH (MHz)** and the **STEP** (the gap between frequencies to try; use the channel spacing of the band, such as 12.5 kHz).
3. Select **Start search**. It stops on signals the same way the scanner does.

To keep a range for later, add it in the **SEARCH RANGES** tab under **ADD RANGE**: give it a **LABEL**, the low and high frequencies, **STEP**, how long to listen on each step (dwell time), **MODE** and the signal threshold. Saved ranges appear under **SAVED RANGES** in **SEARCH**, each with its own start button.

## Edit many at once

**Settings › SDR › Frequencies & Groups (JSON)** holds every saved frequency, group and search range in one JSON file. Select **EDIT** to change it there, then **APPLY CHANGES**, or **EXPORT** to download it as a backup or to load into another Sentinel.
`,xr=`# Listen to a frequency

This page shows you how to find a signal on the waterfall, tune to it and listen. You need a radio added first; see [Add a radio](add-a-radio.md).

## Read the waterfall

The **spectrum** across the top shows signal strength across the band right now: a peak is a signal. The **waterfall** below shows the same over time, newest at the top, so a signal that comes and goes leaves a trail. Brighter means stronger.

- Saved and known frequencies are marked along the waterfall. Select a marker to see its name.
- With **Show Band Plan** on (in **Settings › SDR › SDR Options**), a coloured strip shows which service each part of the band belongs to.
- **ZOOM** spreads a narrower part of the band across the screen. Drag the frequency scale to move along the band.
- The minimum and maximum dB sliders set how faint a signal shows and when it is drawn at full brightness. Lower the maximum to make weak signals stand out.

## Tune and listen

1. Open **SDR** and pick your radio at the top of the **RADIO** tab.
2. Tune to a frequency in one of these ways:
   - select a signal on the waterfall;
   - type the frequency in MHz in the frequency box and press **Enter**;
   - scroll the mouse wheel over a digit of the frequency to step it up or down.
3. Under **CONTROLS › MODULATION**, choose the mode that matches the signal (see below).
4. Select **Tune** (▶) to start the audio. **SIGNAL** shows how strong the signal is.
5. Select **Stop audio** (■) to stop.

![The SDR section tuned to 145.5000 MHz: the radio panel on the left with the play, stop and record buttons, SIGNAL meter, MODULATION and settings; the spectrum and waterfall on the right with the tuned frequency marked.](../../images/sdr-radio-panel.png)

Your browser may block sound until you have selected something on the page. If there is no sound, select **Tune** again.

### Which mode to use

| Mode | Use it for |
|---|---|
| **NFM** | Narrow FM: most two-way radio, amateur repeaters, PMR446, marine VHF. |
| **WFM** | Wide FM: FM broadcast radio. |
| **AM** | Airband (aircraft and airports), and some older services. |
| **USB** | Upper sideband: amateur voice above 10 MHz, and many data modes. |
| **LSB** | Lower sideband: amateur voice below 10 MHz. |
| **CW** | Morse code. |

## Fine-tune the sound

The settings under **CONTROLS** shape what you hear:

- **VOLUME**.
- **SQUELCH** silences the audio until a signal is stronger than this level (in dBFS), so you don't hear noise between transmissions. Raise it until the hiss stops, then a little more.
- **BANDWIDTH** is how wide a slice around the tuned frequency you hear. Narrower cuts out neighbouring signals; too narrow cuts the voice. You can also drag the edges of the highlighted band on the waterfall.
- **RF GAIN** amplifies the signal from the antenna. Too little and weak signals vanish; too much and strong signals swamp everything. Or tick **AGC (Automatic Gain Control)** to let the dongle choose.
- **SAMPLE RATE** is how much of the band the radio takes in at once. Higher shows more of the band, at the cost of more network traffic and CPU.

## Keep listening while you look elsewhere

Audio keeps playing when you go to another section, Settings or the Docs. The tuned frequency stays in the footer so you can see what is playing from anywhere. Stop it from the **SDR** section.

## Settings

The listening options are in **Settings › SDR › SDR Options**:

| Setting | What it does | When to change it |
|---|---|---|
| **Auto-center Waterfall on Tune** | Moves the waterfall so the tuned frequency is in the middle. | Turn off to keep the view still while you tune around. |
| **Snap to Known Frequencies** | Selecting near a known frequency tunes exactly to it. | Turn off to tune freely. |
| **Show Band Plan** | Shows the coloured band strip. | Turn off for a cleaner waterfall. |
| **Display Known Frequencies** | Marks saved and known frequencies on the waterfall. | Turn off for a cleaner waterfall. |
| **Mute Audio While Decoding** | Silences the audio while a digital decoder is running. | Turn on if decoder noise bothers you. |
| **Show Waterfall Timestamps** and **Waterfall Timestamp Interval (Seconds)** | Writes the time down the side of the waterfall, every so many seconds. | To tell when a signal was heard. |

## Troubleshooting

- **No sound.** Check that **Tune** is on, the volume is up, and the squelch isn't higher than the signal. Then select something on the page in case the browser blocked sound. If the panel says why audio is unavailable, follow what it says.
- **Distorted or full of other stations.** Lower **RF GAIN**, or narrow **BANDWIDTH**.
- **Only noise.** Check the mode, and that your antenna suits the band.
`,Sr=`# Record what you hear

This page shows you how to record from your radio, what the files are, and where they are saved. You need a radio added and playing first; see [Listen to a frequency](listen.md).

## What recordings are for

- **Listen again** to something you half-heard, such as a call sign or a weather report.
- **Keep a log** of a net, a contest or a satellite pass.
- **Decode later.** Open the audio in another program, such as a weather-satellite image decoder.
- **Look again at the whole band.** A raw IQ recording keeps everything the radio received, so you can tune to a different signal in it later.

## Record

1. Tune to the signal you want and select **Tune** (▶).
2. Select **Record** (●). While it records, the button shows a square (■).
3. Select **Stop recording** to finish.

While the squelch is closed, the button shows a pause sign and nothing is recorded, so a recording holds only the parts with a signal.

Space can also record a satellite pass for you; see [Space: Tune and record a pass automatically](../space.md#tune-and-record-a-pass-automatically).

## Play, download and delete

Open the **RECORDINGS** tab in the radio panel. Each recording shows its frequency, mode, length and time. For each one you can:

- **Play** it in the browser;
- **Download WAV**, the audio;
- **DOWNLOAD IQ**, the raw signal, if you recorded it (see below). It reads **COPYING IQ…** for a short while after you stop, until the file is ready;
- add a note, and filter the list by **NOTES · MODE**;
- delete it.

## WAV and raw IQ

Every recording saves a **WAV** file of the audio: exactly what you heard. It plays anywhere and is small, about 100 KB a second.

Turn on **Settings › SDR › SDR Options › Record Raw IQ with Recordings (Large Files)** to save a second file of **raw IQ** as well. IQ is the radio's raw signal: the whole band it was receiving, not only what you were listening to, as unsigned 8-bit pairs straight from the dongle (\`.u8\`). Open it in SDR software such as SDR++, GQRX, Universal Radio Hacker or GNU Radio to tune to a different signal in the same band, try another mode, or decode it again.

> [!WARNING]
> Raw IQ is large: about 4 MB a second, some 250 MB a minute, at the default 2.048 MHz sample rate. Turn it on only when you need it.

## Where recordings are saved

Both files of a recording are saved together in one folder, named after the recording's number (\`<id>.wav\` and \`<id>.u8\`). The frequency, mode, sample rate and notes are kept with the recording in Sentinel, not in the file name.

Two settings decide where that folder is. The **recordings root** is where on disk recordings go; you set it once, in \`.env\`. The **recordings folder** is how they are sorted inside it; change it in Settings whenever you like.

### The recordings root

By default recordings are kept inside Docker, in the \`sdr_recordings\` volume. They are safe there across rebuilds and upgrades, but you can only reach them through Sentinel.

To save them to a folder on your computer instead (to open them in other software, keep them on a bigger or external disk, back them up, or share them), set the folder in \`.env\` and restart the SDR service:

\`\`\`bash
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
docker compose up -d sdr
\`\`\`

Docker creates the folder if it doesn't exist. The files are ordinary files you can open from Finder or a file manager. On Linux, also set \`SENTINEL_RUNTIME_USER_ID\` and \`SENTINEL_RUNTIME_GROUP_ID\` in \`.env\` to your own ids (\`id -u\` and \`id -g\`), so the files belong to you.

### The recordings folder

**Settings › SDR › SDR Options › Recordings Folder** picks a folder inside the root, such as \`satellites/noaa\`. It is created when the next recording starts. Use it to keep recordings sorted by what you are doing: set \`satellites/noaa\` before a weather-satellite pass and \`airband\` afterwards, and each session's files land in their own folder. Leave it empty to save straight into the root.

The folder must stay inside the root, so anyone using Settings can sort recordings but can't make Sentinel write anywhere else on the computer. A full path, \`.\` or \`..\`, or a backslash is refused. If one reaches Sentinel another way (a hand-edited config file), the recording goes to the root and the \`sdr\` log says \`Ignoring sdr.recordingsFolder (…); saving to …\`.

### Changing either one

Changing the root or the folder affects **new** recordings only. Every recording remembers the folder it was saved in, so older ones still play, download and delete from where they are, and nothing is moved.

- Recordings made before the recordings folder setting existed stay in \`recordings/\` on the \`sdr_data\` volume.
- If you point \`SENTINEL_RECORDINGS_DIRECTORY\` at a different folder later, recordings saved under the old one show as missing until you copy them across, keeping the same subfolders.

## Settings

| Setting | What it does | When to change it |
|---|---|---|
| **Record Raw IQ with Recordings (Large Files)** | Saves a raw IQ file alongside each WAV. Off by default. | When you want to re-tune or decode a recording later. |
| **Max Recording Length (Minutes)** | A recording still running after this long is stopped and marked failed, and its raw IQ is deleted. Default 360 (6 hours). | Raise it if you record for longer. It is there so a recording nobody stopped (a closed tab, a lost connection) can't fill the disk. |
| **Recordings Folder** | The folder inside the recordings root for new recordings. | Whenever you want to sort recordings by job. |

All three are in **Settings › SDR › SDR Options**. The recordings root is \`SENTINEL_RECORDINGS_DIRECTORY\` in \`.env\`.

## Troubleshooting

- **Record is greyed out.** Nothing is playing. Select **Tune** first.
- **DOWNLOAD IQ stays at COPYING IQ….** The IQ is copied from the radio hub after you stop. If the hub is down, the copy waits and tries again every minute; check \`docker compose ps radio\`.
- **A recording shows as missing.** Its folder has moved: usually \`SENTINEL_RECORDINGS_DIRECTORY\` was changed. Copy the old files across, keeping their subfolders.
- **A recording is marked failed.** It ran past **Max Recording Length**, usually because the browser closed before it was stopped.
`,Cr=`# Sea: ships (AIS)

## What it's for

The **SEA** section shows ships on a live map. Ships broadcast their identity, position, course and destination over a marine radio system called **AIS**. Use Sea to:

- see the shipping near you, coloured by type;
- look up a ship: its name, type, destination, speed and recent track;
- find a port and tune your radio to its VHF channels;
- follow ships with no internet, from your own antenna.

Online, ships come from [AISStream](https://aisstream.io), a free online feed that needs a key. Off grid, they come from your own radio.

## Start it

Sea starts with the rest of Sentinel. To run it on its own:

\`\`\`bash
docker compose up -d gateway sea
\`\`\`

## Before you start

- **Online:** an internet connection and a free AISStream key (see [Add your AISStream key](#add-your-aisstream-key)).
- **Off grid:** a radio with a VHF marine antenna, and the AIS decoder. See [Off grid](#off-grid).

## Using it

### Add your AISStream key

1. Open **Settings › SEA › AIS Data API Key** and select **GET AIS API KEY**. The AISStream website opens in a new tab.
2. Sign in there (a GitHub account works) and create an API key.
3. Paste the key into **API KEY** and select **APPLY CHANGES**.

![Settings › SEA: the AIS Data API Key field near the bottom, where you paste the key; above it, Off Grid AIS SDR is empty because no radio has been added yet. APPLY CHANGES is at the bottom right.](../images/settings-sea.png)

Ships start to appear within a minute. The key is kept secret: it never shows in the config file or in an exported configuration. To remove it, select **FORGET KEY**.

> [!IMPORTANT]
> AISStream allows **one connection per key**. Use each key in one Sentinel only. If two use the same key, both keep losing the feed, and reconnecting too often can get the key locked out for a while. Sentinel reconnects slowly on purpose for this reason.

### Choose how much of the world to cover

By default Sea receives ships worldwide, which is hundreds of messages a second. On a small computer, choose a smaller area: open **Settings › SEA › Coverage Area**, move the Sea map to your area and select **USE CURRENT MAP VIEW**, or type the **NORTH**, **SOUTH**, **EAST** and **WEST** edges. **WORLDWIDE** goes back to the whole world.

### Look at a ship

Select a ship on the map to show its recent track and its details: **VESSEL** (type, MMSI number, IMO number, callsign, navigation status and when its position was last heard), **VOYAGE** (destination), **POSITION** and **MOVEMENT** (speed, course and heading). Between reports Sentinel moves each ship along its course, so the map doesn't jump every few seconds.

Ships not heard for 30 minutes leave the map.

![A ship's details in the FILTER pane, grouped as VESSEL, VOYAGE, POSITION and MOVEMENT, with labelled ships on the map.](../images/sea-vessel-details.png)

### Find a ship or port

Open **FILTER** and type a name, MMSI number, type or destination. The buttons under **FILTER** show one type of ship at a time, or **ALL VESSELS**. The list is also a way to read the map without seeing it.

### Listen to a port

Turn on the **Ports** layer (**MAP LAYERS** in the map controls, or **Settings › SEA › Map Layers**). Select a port to see its **VHF CHANNELS**. Select a channel to tune your radio to it. You need a radio set up in the SDR section; see [Add a radio](sdr/add-a-radio.md).

### Map layers

**Settings › SEA › Map Layers** chooses what the map draws: **Vessel labels**, **Range rings**, **Ferry routes** (the regular ferry crossings) and **Ports**. Changes show on the map at once, and **APPLY CHANGES** keeps them as the defaults for every device. **Settings › SEA › Vessel Label Fields** chooses what each ship's label shows.

## Off grid

Off grid, Sea decodes AIS from your own radio instead of AISStream, using the AIS decoder. The map, tracks and ship types work the same way. You need a radio you can give to AIS full time and a marine VHF antenna. [Track ships off grid with your own radio](../tasks/track-ships-off-grid.md) has the steps.

## Settings

All under **Settings › SEA**:

| Setting | What it does | When to change it |
|---|---|---|
| **Source Override** | Uses **ONLINE** or **OFF GRID** for Sea only. | When Sea should use your radio while other sections stay online, or the other way round. |
| **Off Grid AIS SDR** | The radio that receives AIS off grid. | When you set up off-grid Sea. |
| **Online Data Source** | The AISStream address. Default \`wss://stream.aisstream.io/v0/stream\`. | Rarely. |
| **AIS Data API Key** | Your AISStream key. | Once, when you set Sea up, or if the key changes. |
| **Coverage Area** | The area to receive ships for. Default worldwide. | On a small computer, or to see only your area. |
| **Map Layers** | Which layers the map draws. | To change what you see by default. |
| **Vessel Label Fields** | What each ship's label shows. | To show more or less on the map. |

## Troubleshooting

The notice at the top of the Sea map says what is wrong:

- **"No AISStream API key configured."** Add your key (see [Add your AISStream key](#add-your-aisstream-key)).
- **"AISStream rejected the API key."** Check the key. Sentinel tries a rejected key again once an hour, or straight away when you change it.
- **"No off-grid AIS receiver selected."** Pick a radio in **Off Grid AIS SDR**.
- **"The AIS decoder is not running"** Start it with \`docker compose --profile ais up -d\`.
- **"The AIS receiver has been tuned away from the AIS channels"** Something else tuned the radio. It retunes itself within about 15 seconds.
- **No ships off grid, and no notice.** AIS is line of sight. Put the antenna higher, and check it is a marine VHF antenna (around 162 MHz). Inland, there may be no ships in range.
`,wr=`# Change settings

This page explains how Settings works: where to find a setting, and why your changes wait until you apply them.

## Open Settings

Select the gear at the bottom right of the screen. Settings fills the screen, with its own menu on the left: **App Settings** for things that affect all of Sentinel, then one entry for each section you run (**AIR**, **SPACE**, **SEA**, **LAND**, **SDR**). Close it with the close button or **Escape**, and you go back to the section you came from.

![Settings › App Settings: the Settings menu down the left with Docs at the bottom, SEARCH SETTINGS at the top, Connectivity Mode and Alert Sound, and APPLY CHANGES at the bottom right.](../images/settings-app.png)

Each part of Settings has its own web address, such as \`/settings/sea\`, so you can bookmark it or send it to someone on your network.

## Find a setting

Type in **SEARCH SETTINGS** at the top. Settings lists every setting whose name or description contains all the words you typed, in any section. Search for what a setting does, not only its name: "squawk", "recordings" or "coverage" all work.

Where a setting has a page in these docs, a link beside it opens that page.

## Apply your changes

Most settings don't take effect as you change them. Sentinel holds your changes until you select **APPLY CHANGES** at the bottom of Settings, then saves them all at once. This lets you change several related settings, such as a radio and the mode that uses it, and have them take effect together.

- After **APPLY CHANGES**, Sentinel updates in place. You don't need to reload the page.
- If you select **APPLY CHANGES** with nothing changed, it says **NO CHANGES**.
- If you close Settings or move to another part of it without applying, your changes are thrown away.

A few controls act straight away because they do something rather than set something: **UPDATE TLE**, adding or removing a radio or Sentry host, **DOWNLOAD** in Offline Maps, and **EXPORT** buttons.

Settings are saved on the Sentinel computer, not in your browser, so every browser and device that opens Sentinel sees the same settings.

## Online or off grid

**Settings › App Settings › Connectivity Mode** switches all of Sentinel between **ONLINE** (data from the internet) and **OFF GRID** (data from your own radios, maps you downloaded and data already stored). Choosing it sets every section to that mode.

Air and Sea also have a **Source Override** in their own settings, to run that one section differently: for example Sea off grid from your own AIS radio while Air stays online. Choosing **Connectivity Mode** again replaces these overrides; the **SECTION OVERRIDES** list under it shows what each section will become.

## Back up your settings

**Settings › App Settings › Export All Configuration** saves all your settings, frequencies and band plan to a folder you choose, as three files: \`sentinel_config.json\`, \`sdr_frequencies.json\` and \`sdr_bandplan.json\`. To edit or load settings as a file, see [Edit the config file](config-file.md).
`,Tr=`# Space: satellites

## What it's for

The **SPACE** section shows satellites on a globe: where each one is now, where it is going, and when it will next pass over you. Use Space to:

- find a satellite and follow it;
- see which satellites will pass over you, and how high in the sky;
- get an alert a few minutes before a pass;
- have your radio tune itself to a satellite as it rises, and record it;
- see where on Earth it is day and night.

Sentinel works out every position itself from each satellite's **TLE** (two-line element set), a short public description of its orbit. Online, it downloads TLEs from [CelesTrak](https://celestrak.org). Once they are downloaded, Space works with no internet.

## Start it

Space starts with the rest of Sentinel. To run it on its own:

\`\`\`bash
docker compose up -d gateway space
\`\`\`

## Before you start

- Set **Settings › App Settings › Sentinel Location**. Passes are worked out for that spot.
- Load some satellites: **Settings › SPACE › Online Data Source**, pick a category such as **Amateur Radio**, then select **UPDATE TLE**. Until there are satellites, the map says "No satellite data available."
- To listen to or record a pass, [add a radio](sdr/add-a-radio.md).

## Using it

### Find a satellite

Open **FILTER** in the sidebar and type a name, a NORAD ID (the catalogue number every satellite has) or a category. The buttons under **FILTER** show one category at a time. Select a satellite to show it on the map with its path over the next orbits (**GROUND TRACK**) and the area of Earth that can see it (**FOOTPRINT**). Its details include its radio frequencies, if known, and its **UPCOMING PASSES**.

Select **Track satellite** to keep the map following it. It also appears under **TRACKING** in the sidebar.

### See passes over you

Open **PASSES** in the sidebar. It lists the next passes of the satellites you have loaded, soonest first, with the time it rises, its highest point in the sky and how long it lasts. Select a pass to see its path across your sky as a polar plot: the middle is straight overhead and the edge is the horizon. Passes with a high maximum elevation give the clearest signal.

![The PASSES pane: three upcoming passes, soonest first, each with its rise time, length and highest elevation, and category buttons above to filter them.](../images/space-passes.png)

### Get an alert before a pass

Select **Enable pass alerts** (the bell) on a pass. About five minutes before the satellite rises, an alert says it is coming. You can turn pass alerts off again from the pass or from **Settings › App Settings › Alerts**.

### Tune and record a pass automatically

For a satellite with a known downlink frequency, a pass also offers:

- **Auto-tune SDR**: when the satellite rises, your radio tunes to its downlink in the right mode. When it sets, the radio goes back to what it was doing.
- **Record pass**: records the pass while it is tuned. This needs **Auto-tune SDR** on too.

Sentinel must be open in a browser tab for these to happen, because the browser does the tuning and plays the audio. [Catch a satellite pass and record it](../tasks/record-a-satellite-pass.md) goes through it step by step.

### Day and night

**DAY / NIGHT** in the map controls shades the half of the Earth in darkness. **LOCATION NAMES** adds place names.

## Off grid

Space needs no internet once satellites are loaded: every position and pass is worked out on your computer. TLEs go out of date as orbits change, though. Positions drift by a few kilometres a day, so update them before you go off grid and at least weekly while you can.

With no internet at all, load TLEs from a file: **Settings › SPACE › TLE Import** takes a \`.txt\` file of TLEs (three lines per satellite: name, then the two element lines).

## Settings

All under **Settings › SPACE**:

| Setting | What it does | When to change it |
|---|---|---|
| **Online Data Source** | Where to download TLEs from, by category. **UPDATE TLE** downloads them now. | To load satellites, or to refresh them. |
| **TLE Import** | Loads TLEs from a \`.txt\` file. | When you have no internet, or your own TLEs. |
| **TLE Database** | How many satellites are stored, from where, and when each category was updated. Clears all of them or one category. | To tidy up, or to start again. |
| **Satellite Frequencies (JSON)** | Every satellite's radio frequencies, which auto-tune uses. | To add or correct a frequency. |
| **Filter Hover Behaviour** | Whether the map stays put or flies to a satellite when you hover over it in the **FILTER** list. | If the map moving about distracts you. |

## Troubleshooting

- **"No satellite data available."** No TLEs are stored. Load some (see [Before you start](#before-you-start)).
- **Auto-tune isn't offered for a satellite.** Sentinel doesn't know its downlink. Add it to **Satellite Frequencies (JSON)**.
- **The pass came and went, but nothing tuned.** Check that a browser had Sentinel open, that the SDR section has a radio connected, and that no other job (such as an APRS decoder) holds that radio.
- **Positions look wrong.** The TLEs are old. Select **UPDATE TLE**.
`,Er=`/spa-assets/air-aircraft-details-Ocg-zgUT.png`,Dr=`/spa-assets/alerts-pane-CC4rY3-5.png`,Or=`/spa-assets/interface-air-screen-BrzcTAko.png`,kr=`/spa-assets/interface-phone-DMiK3Gmk.png`,Ar=`/spa-assets/land-repeater-details-CZGBjQ7W.png`,jr=`/spa-assets/sdr-radio-panel-BIlVlSAj.png`,Mr=`/spa-assets/sea-vessel-details-BuS85Ydt.png`,Nr=`/spa-assets/settings-add-radio-CShtse-G.png`,Pr=`/spa-assets/settings-app-waghSk0-.png`,Fr=`/spa-assets/settings-offline-maps-DvWs0lrb.png`,Ir=`/spa-assets/settings-sea-DmG-zH-X.png`,Lr=`/spa-assets/space-passes-kc8Uc7it.png`,Rr={groups:[{key:`get-started`,title:`Get started`,pages:[{path:`index`,title:`Welcome to Sentinel`},{path:`install`,title:`Quick start`}]},{key:`things-you-can-do`,title:`Things you can do`,pages:[{path:`tasks/no-internet`,title:`Run Sentinel with no internet`},{path:`tasks/record-a-satellite-pass`,title:`Catch a satellite pass and record it`},{path:`tasks/aircraft-emergency-alerts`,title:`Get alerted to aircraft emergencies`},{path:`tasks/listen-to-a-repeater`,title:`Find and listen to a local repeater`},{path:`tasks/track-ships-off-grid`,title:`Track ships off grid with your own radio`}]},{key:`use-sentinel`,title:`Use Sentinel`,pages:[{path:`use/interface`,title:`Find your way around the screen`},{path:`use/air`,title:`Air: aircraft (ADS-B)`},{path:`use/space`,title:`Space: satellites`},{path:`use/sea`,title:`Sea: ships (AIS)`},{path:`use/land`,title:`Land: repeaters and APRS`},{title:`SDR: your radios`,pages:[{path:`use/sdr/add-a-radio`,title:`Add a radio`},{path:`use/sdr/listen`,title:`Listen to a frequency`},{path:`use/sdr/frequencies`,title:`Save and scan frequencies`},{path:`use/sdr/record`,title:`Record what you hear`},{path:`use/sdr/decode`,title:`Decode digital signals`}]},{path:`use/alerts`,title:`Alerts`},{path:`use/maps`,title:`Change the map look`},{path:`use/offline-maps`,title:`Download maps for offline use`},{path:`use/settings`,title:`Change settings`},{path:`use/config-file`,title:`Edit the config file`},{path:`use/receiving-responsibly`,title:`Receiving responsibly`}]},{key:`set-up-and-run`,title:`Set up and run`,pages:[{path:`configuration`,title:`Environment variables (.env)`},{path:`hardware`,title:`Choose radios and hardware`},{path:`decoders`,title:`Install and run decoders`},{path:`radio-host`,title:`Run the radios on a second machine`},{path:`operations`,title:`Check logs, health and backups`},{path:`troubleshooting`,title:`Troubleshooting`},{path:`upgrading`,title:`Upgrade Sentinel`}]},{key:`how-it-works`,title:`How it works`,pages:[{path:`architecture/overview`,title:`System overview`},{path:`architecture/docker`,title:`How Sentinel runs in Docker`},{path:`architecture/backend`,title:`Backend code`},{path:`architecture/frontend`,title:`Frontend`},{path:`architecture/gateway`,title:`Gateway and routing`},{path:`architecture/event-bus`,title:`Event bus`},{path:`architecture/services`,title:`Services and start-up`},{path:`architecture/data-stores`,title:`Data stores`},{path:`architecture/databases`,title:`Databases`},{path:`architecture/caching`,title:`Caching`},{path:`architecture/sdr-pipeline`,title:`Radios and the SDR pipeline`},{path:`architecture/decoding`,title:`Decoding`},{path:`architecture/data-flows`,title:`Section data flows`},{path:`architecture/security`,title:`Security`}]},{key:`develop`,title:`Develop`,pages:[{path:`development/setup`,title:`Set up for development`},{path:`development/code-map`,title:`Find your way around the code`},{path:`development/testing`,title:`Run tests and quality checks`},{path:`development/how-to`,title:`How to…`},{path:`contributing`,title:`Contributing`,file:`CONTRIBUTING.md`},{title:`Design decisions`,pages:[{path:`adr/0006-section-containers`,title:`0006 Section containers`},{path:`adr/0005-sea-ais-vessel-tracking`,title:`0005 Sea AIS vessel tracking`},{path:`adr/0004-remove-trunk-tracking`,title:`0004 Remove trunk tracking`},{path:`adr/0003-sentry-sdr-lock-and-tune`,title:`0003 Sentry SDR lock and tune`},{path:`adr/0002-base-component-dedupe`,title:`0002 Shared base components`},{path:`adr/0001-webapp-standards-retrofit`,title:`0001 Retrofit to the webapp standards`}]}]},{key:`reference`,title:`Reference`,pages:[{path:`reference/glossary`,title:`Glossary`},{path:`reference/ports-and-services`,title:`Ports and services`},{path:`reference/commands`,title:`Commands cheat sheet`},{path:`reference/whats-new`,title:`What's new`}]}],synonyms:{plane:[`Air`,`aircraft`,`ADS-B`],planes:[`Air`,`aircraft`,`ADS-B`],aeroplane:[`Air`,`aircraft`,`ADS-B`],aircraft:[`Air`,`ADS-B`],flight:[`Air`,`aircraft`,`ADS-B`],ship:[`Sea`,`vessel`,`AIS`],ships:[`Sea`,`vessel`,`AIS`],boat:[`Sea`,`vessel`,`AIS`],vessel:[`Sea`,`AIS`],satellite:[`Space`,`orbit`,`pass`],satellites:[`Space`,`orbit`,`pass`],ham:[`Land`,`SDR`,`APRS`],radio:[`SDR`,`rtl_tcp`,`dongle`],dongle:[`SDR`,`rtl_tcp`,`radio`],offline:[`Off Grid`,`tiles`,`pmtiles`],map:[`tiles`,`pmtiles`],password:[`credentials`,`secret`],env:[`environment`,`configuration`],scanner:[`SDR`,`scan`,`search`],repeater:[`Land`,`repeaters`],record:[`recording`,`recordings`],recording:[`record`,`recordings`],emergency:[`squawk`,`7700`],squawk:[`emergency`,`Air`],internet:[`Off Grid`,`offline`],docker:[`compose`,`container`,`volume`],database:[`SQLite`,`databases`,`db`],architecture:[`overview`,`how it works`],nats:[`event bus`],caddy:[`gateway`]}},zr=Object.assign({"../../../../CONTRIBUTING.md":xn,"../../../../docs/adr/0001-webapp-standards-retrofit.md":Sn,"../../../../docs/adr/0002-base-component-dedupe.md":Cn,"../../../../docs/adr/0003-sentry-sdr-lock-and-tune.md":wn,"../../../../docs/adr/0004-remove-trunk-tracking.md":Tn,"../../../../docs/adr/0005-sea-ais-vessel-tracking.md":En,"../../../../docs/adr/0006-section-containers.md":Dn,"../../../../docs/architecture/backend.md":On,"../../../../docs/architecture/caching.md":kn,"../../../../docs/architecture/data-flows.md":An,"../../../../docs/architecture/data-stores.md":jn,"../../../../docs/architecture/databases.md":Mn,"../../../../docs/architecture/decoding.md":Nn,"../../../../docs/architecture/docker.md":Pn,"../../../../docs/architecture/event-bus.md":Fn,"../../../../docs/architecture/frontend.md":In,"../../../../docs/architecture/gateway.md":Ln,"../../../../docs/architecture/overview.md":Rn,"../../../../docs/architecture/sdr-pipeline.md":zn,"../../../../docs/architecture/security.md":Bn,"../../../../docs/architecture/services.md":Vn,"../../../../docs/configuration.md":Hn,"../../../../docs/decoders.md":Un,"../../../../docs/development/code-map.md":Wn,"../../../../docs/development/how-to.md":Gn,"../../../../docs/development/setup.md":Kn,"../../../../docs/development/testing.md":qn,"../../../../docs/hardware.md":Jn,"../../../../docs/index.md":Yn,"../../../../docs/install.md":Xn,"../../../../docs/operations.md":Zn,"../../../../docs/radio-host.md":Qn,"../../../../docs/reference/commands.md":$n,"../../../../docs/reference/glossary.md":er,"../../../../docs/reference/ports-and-services.md":tr,"../../../../docs/reference/whats-new.md":nr,"../../../../docs/tasks/aircraft-emergency-alerts.md":rr,"../../../../docs/tasks/listen-to-a-repeater.md":ir,"../../../../docs/tasks/no-internet.md":ar,"../../../../docs/tasks/record-a-satellite-pass.md":or,"../../../../docs/tasks/track-ships-off-grid.md":sr,"../../../../docs/troubleshooting.md":cr,"../../../../docs/upgrading.md":lr,"../../../../docs/use/air.md":ur,"../../../../docs/use/alerts.md":dr,"../../../../docs/use/config-file.md":fr,"../../../../docs/use/interface.md":pr,"../../../../docs/use/land.md":mr,"../../../../docs/use/maps.md":hr,"../../../../docs/use/offline-maps.md":gr,"../../../../docs/use/receiving-responsibly.md":_r,"../../../../docs/use/sdr/add-a-radio.md":vr,"../../../../docs/use/sdr/decode.md":yr,"../../../../docs/use/sdr/frequencies.md":br,"../../../../docs/use/sdr/listen.md":xr,"../../../../docs/use/sdr/record.md":Sr,"../../../../docs/use/sea.md":Cr,"../../../../docs/use/settings.md":wr,"../../../../docs/use/space.md":Tr}),Br=Object.assign({"../../../../docs/images/air-aircraft-details.png":Er,"../../../../docs/images/alerts-pane.png":Dr,"../../../../docs/images/interface-air-screen.png":Or,"../../../../docs/images/interface-phone.png":kr,"../../../../docs/images/land-repeater-details.png":Ar,"../../../../docs/images/sdr-radio-panel.png":jr,"../../../../docs/images/sea-vessel-details.png":Mr,"../../../../docs/images/settings-add-radio.png":Nr,"../../../../docs/images/settings-app.png":Pr,"../../../../docs/images/settings-offline-maps.png":Fr,"../../../../docs/images/settings-sea.png":Ir,"../../../../docs/images/space-passes.png":Lr});function Vr(e){return Object.fromEntries(Object.entries(e).map(([e,t])=>[gn(e),t]))}var Hr=Vr(Br),Ur;function Wr(){return Ur??=yn(Rr,Vr(zr)),Ur}function Gr(){let e=ne(),t=D(),n=Wr(),r=p(()=>hn(he(e))),i=p(()=>n.pageByPath.get(r.value)),a=p(()=>n.groups.find(e=>e.key===i.value?.groupKey)),o=p(()=>typeof e.query.q==`string`?e.query.q:``),s=p(()=>o.value.trim().length>=2),c=p(()=>{let t=e.hash.replace(/^#/,``);try{return decodeURIComponent(t)}catch{return t}});function l(n){let{q:r,...i}=e.query;t.replace({path:e.path,query:n===``?i:{...i,q:n},hash:e.hash})}return{library:n,pagePath:r,page:i,activeGroup:a,query:o,searchActive:s,hashId:c,setQuery:l}}function Kr(e,t){let n=me(),i;r(e,e=>{clearTimeout(i),!(!e||!t.value)&&(i=setTimeout(()=>{let t=e.totalHits;n.announce(t===0?`No results`:`${t} ${t===1?`result`:`results`}`)},500))},{immediate:!0}),C(()=>clearTimeout(i))}var qr={};function Jr(e){let t=qr[e];if(t)return t;t=qr[e]=[];for(let e=0;e<128;e++){let n=String.fromCharCode(e);t.push(n)}for(let n=0;n<e.length;n++){let r=e.charCodeAt(n);t[r]=`%`+(`0`+r.toString(16).toUpperCase()).slice(-2)}return t}function M(e,t){typeof t!=`string`&&(t=M.defaultChars);let n=Jr(t);return e.replace(/(%[a-f0-9]{2})+/gi,function(e){let t=``;for(let r=0,i=e.length;r<i;r+=3){let a=parseInt(e.slice(r+1,r+3),16);if(a<128){t+=n[a];continue}if((a&224)==192&&r+3<i){let n=parseInt(e.slice(r+4,r+6),16);if((n&192)==128){let e=a<<6&1984|n&63;e<128?t+=`��`:t+=String.fromCharCode(e),r+=3;continue}}if((a&240)==224&&r+6<i){let n=parseInt(e.slice(r+4,r+6),16),i=parseInt(e.slice(r+7,r+9),16);if((n&192)==128&&(i&192)==128){let e=a<<12&61440|n<<6&4032|i&63;e<2048||e>=55296&&e<=57343?t+=`���`:t+=String.fromCharCode(e),r+=6;continue}}if((a&248)==240&&r+9<i){let n=parseInt(e.slice(r+4,r+6),16),i=parseInt(e.slice(r+7,r+9),16),o=parseInt(e.slice(r+10,r+12),16);if((n&192)==128&&(i&192)==128&&(o&192)==128){let e=a<<18&1835008|n<<12&258048|i<<6&4032|o&63;e<65536||e>1114111?t+=`����`:(e-=65536,t+=String.fromCharCode(55296+(e>>10),56320+(e&1023))),r+=9;continue}}t+=`�`}return t})}M.defaultChars=`;/?:@&=+$,#`,M.componentChars=``;var Yr={};function Xr(e){let t=Yr[e];if(t)return t;t=Yr[e]=[];for(let e=0;e<128;e++){let n=String.fromCharCode(e);/^[0-9a-z]$/i.test(n)?t.push(n):t.push(`%`+(`0`+e.toString(16).toUpperCase()).slice(-2))}for(let n=0;n<e.length;n++)t[e.charCodeAt(n)]=e[n];return t}function N(e,t,n){typeof t!=`string`&&(n=t,t=N.defaultChars),n===void 0&&(n=!0);let r=Xr(t),i=``;for(let t=0,a=e.length;t<a;t++){let o=e.charCodeAt(t);if(n&&o===37&&t+2<a&&/^[0-9a-f]{2}$/i.test(e.slice(t+1,t+3))){i+=e.slice(t,t+3),t+=2;continue}if(o<128){i+=r[o];continue}if(o>=55296&&o<=57343){if(o>=55296&&o<=56319&&t+1<a){let n=e.charCodeAt(t+1);if(n>=56320&&n<=57343){i+=encodeURIComponent(e[t]+e[t+1]),t++;continue}}i+=`%EF%BF%BD`;continue}i+=encodeURIComponent(e[t])}return i}N.defaultChars=`;/?:@&=+$,-_.!~*'()#`,N.componentChars=`-_.!~*'()`;function Zr(e){let t=``;return t+=e.protocol||``,t+=e.slashes?`//`:``,t+=e.auth?e.auth+`@`:``,e.hostname&&e.hostname.indexOf(`:`)!==-1?t+=`[`+e.hostname+`]`:t+=e.hostname||``,t+=e.port?`:`+e.port:``,t+=e.pathname||``,t+=e.search||``,t+=e.hash||``,t}function Qr(){this.protocol=null,this.slashes=null,this.auth=null,this.port=null,this.hostname=null,this.hash=null,this.search=null,this.pathname=null}var $r=/^([a-z0-9.+-]+:)/i,ei=/:[0-9]*$/,ti=/^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,ni=[`%`,`/`,`?`,`;`,`#`,`'`,`{`,`}`,`|`,`\\`,`^`,"`",`<`,`>`,`"`,"`",` `,`\r`,`
`,`	`],ri=[`/`,`?`,`#`],ii=255,ai=/^[+a-z0-9A-Z_-]{0,63}$/,oi=/^([+a-z0-9A-Z_-]{0,63})(.*)$/,si={javascript:!0,"javascript:":!0},ci={http:!0,https:!0,ftp:!0,gopher:!0,file:!0,"http:":!0,"https:":!0,"ftp:":!0,"gopher:":!0,"file:":!0};function li(e,t){if(e&&e instanceof Qr)return e;let n=new Qr;return n.parse(e,t),n}Qr.prototype.parse=function(e,t){let n,r,i,a=e;if(a=a.trim(),!t&&e.split(`#`).length===1){let e=ti.exec(a);if(e)return this.pathname=e[1],e[2]&&(this.search=e[2]),this}let o=$r.exec(a);if(o&&(o=o[0],n=o.toLowerCase(),this.protocol=o,a=a.substr(o.length)),(t||o||a.match(/^\/\/[^@\/]+@[^@\/]+/))&&(i=a.substr(0,2)===`//`,i&&!(o&&si[o])&&(a=a.substr(2),this.slashes=!0)),!si[o]&&(i||o&&!ci[o])){let e=-1;for(let t=0;t<ri.length;t++)r=a.indexOf(ri[t]),r!==-1&&(e===-1||r<e)&&(e=r);let t,n;n=e===-1?a.lastIndexOf(`@`):a.lastIndexOf(`@`,e),n!==-1&&(t=a.slice(0,n),a=a.slice(n+1),this.auth=t),e=-1;for(let t=0;t<ni.length;t++)r=a.indexOf(ni[t]),r!==-1&&(e===-1||r<e)&&(e=r);e===-1&&(e=a.length),a[e-1]===`:`&&e--;let i=a.slice(0,e);a=a.slice(e),this.parseHost(i),this.hostname=this.hostname||``;let o=this.hostname[0]===`[`&&this.hostname[this.hostname.length-1]===`]`;if(!o){let e=this.hostname.split(/\./);for(let t=0,n=e.length;t<n;t++){let n=e[t];if(n&&!n.match(ai)){let r=``;for(let e=0,t=n.length;e<t;e++)n.charCodeAt(e)>127?r+=`x`:r+=n[e];if(!r.match(ai)){let r=e.slice(0,t),i=e.slice(t+1),o=n.match(oi);o&&(r.push(o[1]),i.unshift(o[2])),i.length&&(a=i.join(`.`)+a),this.hostname=r.join(`.`);break}}}}this.hostname.length>ii&&(this.hostname=``),o&&(this.hostname=this.hostname.substr(1,this.hostname.length-2))}let s=a.indexOf(`#`);s!==-1&&(this.hash=a.substr(s),a=a.slice(0,s));let c=a.indexOf(`?`);return c!==-1&&(this.search=a.substr(c),a=a.slice(0,c)),a&&(this.pathname=a),ci[n]&&this.hostname&&!this.pathname&&(this.pathname=``),this},Qr.prototype.parseHost=function(e){let t=ei.exec(e);t&&(t=t[0],t!==`:`&&(this.port=t.substr(1)),e=e.substr(0,e.length-t.length)),e&&(this.hostname=e)};var ui=e({decode:()=>M,encode:()=>N,format:()=>Zr,parse:()=>li}),di=e({Any:()=>fi,Cc:()=>pi,Cf:()=>mi,P:()=>hi,S:()=>gi,Z:()=>_i}),fi=/[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/,pi=/[\0-\x1F\x7F-\x9F]/,mi=/[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/,hi=/[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B4E\u1B4F\u1B5A-\u1B60\u1B7D-\u1B7F\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDD6E\uDEAD\uDED0\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9\uDFD4\uDFD5\uDFD7\uDFD8]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09\uDFE1]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDD6D-\uDD6F\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD839\uDDFF|\uD83A[\uDD5E\uDD5F]/,gi=/[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C1\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2429\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E5\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBD2\uFD40-\uFD4F\uFD90\uFD91\uFDC8-\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD803[\uDD8E\uDD8F\uDED1-\uDED8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDC00-\uDCEF\uDCFA-\uDCFC\uDD00-\uDEB3\uDEBA-\uDED0\uDEE0-\uDEF0\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED8\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0-\uDCBB\uDCC0\uDCC1\uDCD0-\uDCD8\uDD00-\uDE57\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF-\uDEF8\uDF00-\uDF92\uDF94-\uDFEF\uDFFA]/,_i=/[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/,vi=[8364,0,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,0,381,0,0,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,0,382,376];function yi(e){return e===0||e>=55296&&e<=57343||e>1114111}function bi(e){return yi(e)?65533:e>=128&&e<=159&&vi[e-128]||e}function xi(e){return e-1>>>0<127||e-160>>>0<55136?String.fromCharCode(e):String.fromCodePoint(bi(e))}var P=(()=>{let e=new Uint8Array(127),t=0;for(let n=33;n<=126;n++)n!==34&&n!==36&&n!==92&&(e[n]=t++);return e})();function Si(e,t,n,r,i,a){let o=e.length,s=a*90,c=0,l=()=>{let t=P[e.charCodeAt(c++)];return t<a?t:t*91-s+P[e.charCodeAt(c++)]},u=n-r,d=n+i,f=new Int32Array(d);f.fill(-1,r,a),f.fill(-1,a+u,d);let p=new Int32Array(d),m=new Int32Array(d);function h(t,n){let r=0,i=n,a=n+t;for(;i<a;){let t=P[e.charCodeAt(c++)];if(t<89)r+=t,f[i++]=r;else if(t===89){let t=P[e.charCodeAt(c++)]+2;for(;t--;)f[i++]=++r}else{let t=P[e.charCodeAt(c++)];r+=89+(t<90?t*91+P[e.charCodeAt(c++)]:P[e.charCodeAt(c++)]*8281+P[e.charCodeAt(c++)]*91+P[e.charCodeAt(c++)]),f[i++]=r}}}h(r,0),h(u,a);let g=new Int32Array(i*2),_=0,v=0;function y(e,t){for(let n=0;n<e;n++){let e=t+n,r=l(),i=l();g[v*2]=r,g[v*2+1]=i,v+=1,p[e]=_;let a=(f[r]<0?m[r]:1)+(f[i]<0?m[i]:1);m[e]=a,_+=a}}y(i-a+r,a+u),y(a-r,r);let b=new Uint16Array(_),x=0;for(let e=0;e<v;e++)for(let t=0;t<2;t++){let n=g[e*2+t],r=f[n];if(r<0){let e=p[n],t=e+m[n];for(;e<t;)b[x++]=b[e++]}else b[x++]=r}let S=new Uint16Array(t),C=0;for(;c<o;){let t=P[e.charCodeAt(c++)];t>=a&&(t=t*91-s+P[e.charCodeAt(c++)]);let n=f[t];if(n<0){let e=p[t],n=e+m[t];for(;e<n;)S[C++]=b[e++]}else S[C++]=n}return S}var Ci=Si("!}.&u%}'&}*'~!6*)%&,~!J~!J~%L~y<~!R,~~%Lu~~#GD~~#|)1#%}^%}2%+#.##%##%}&%##%'#%##&%#%#'%#&#%#&#'#%%#&#%##%#)%''%&%#%#'%#%%#%%}%%%#%#&(23#%%#&-%0%('1#(##%#'##+%'*.:1}#%#6-+(%'%%#%%%}#L'2351&('%}&/N'(0(/*-%(%%}#'+&T%7.2}#&%&#%#36/5##%&%%#&#%%#))2%%##%&&'0~!#*+&'%1~!%).'3q?&%'1~!.##%6(~!+%%%(Gw'rT~!E#<nA%#jZ~!H%(~!42##~!*31&~!G%U~#)5~#`3~!J~!Z~%]~%Y~%C~!q~!u~#kz~%#~!6'~!D~!U~!?~#T~!c%~!G#'~%7|~!G~!J~!G&~#pb~(Df}#%}*&}#%##%##%##&#-}&'#'&%#.++}%mI,#,@&(}*%}*'%&##&#%##%}&0}#.},U},%}+%}&%}#%##&}B%(}(%}+%)})%##%#&}&%##%&}<%}>%#%&}*%}(%}9%}/%})%}*%}*%}?&}&%}3%}&*#%})%#%#)}#&#-#+*%E%%'%'#%}#*V##&##I}#&&##%&%#&&Qf%%))w/0+&%#(#.%-''''++++7}>%4'',##1,#%#&%##&#'##&#*#9)%&%}#*}%,#+P(%A&%#'&##wSD',9E00#y#@}(+}&%&>~!#~!X}#*}(&&}(&}(,%}%&#+&}#&}I%#%}%)#(},'%#*}4%%#%}(''}#/##(##),%-##%%)#&}(.}&%#&}%%}*&#%},&&}&%}#%*'#%})%}D&}&%}-&}6&#&}-,%}#%})-(~+`~,=?~I9'9%~!,#%})%})%}@%}?%}(~!?~#<~#pP~#BG~#=1#%K+~#?#~%;)~#A~#mF1~#A'~'X%'~#lR~#N~'N~#r~#m#-~#i'?%#'%~#B%##%,%#~#_%#0%~#]732~,w~2+#:&#%&'0%&>%}#>##F+)#%&&#(+_}4&}-%}(&}@&}O7Fdf0@+/v4}&WU##&/0#&'('B#%}.%}'+#%}#%%&#&%#%##+#&#)#6#'#.},%}c%},%#%##%&#&%#&~#>'*-.%##%##%}#%%}%'~#)D1}#%*&~#_%%'(~#S2%'.}#~#=##*'*-%}&'%'##&&~'E%.#&~#M4}%%##&'%#~#O1##%&#'+~#<B%##%%'%+~#;#@%}#&%#&&%#(~#H1}'%'##&&~#?A}&'~#D#%32}'&&&&~#[}'(#%}'~#;C})&}%%#%~#=&%,3}%'(#%%~#^'#&&)#%'~#Y%-~#d-%'~#^%%&#&&&}#~#b~2t*&'~&(~&@~0%~e~3}%*''0})&}+~!9##-}#%-hD*)1fC#%/&/fB#40~!+#)*4~!+~!K'&:~!/*7~!.#~!H~!L':~%x&~!H#~!*~%1~!I#~!+A~#p'~!F~~#-#~,,(~.Z~!V~%;'B'mq-W~!N~%I%#&&#&}#%},%%}'%}+X#%}#&}(%}'%}<%}#%}%%'}'%}:~![)9@~%>~#UA%-%##&~!C%~!-.9:~!1~!-^2/:a~!y,D*J#-5)/4~%23,~#G~!L1~!0X3`~!2+~!!0-~&E~!W~!o,>Y&]~%cZx_&~#O*9#A#'#+I'%#)~!0B*-5A+-((F&*M#)(-7-5+'-3a5Vi~!Y~!?+[)%3),ERHm~!+:D,VG.+)?fB%%*(%)'(#&80%1'8`K8?`+'Z#&O&'H5#*9)A%%5&3))0%39+.*7#()&&*=4@**L)<'_&*+..;(#*+)./&0#3)%')-8(4ixD(&.}%,('aI:,)%,k2231T)I'#/-W7,/'Q#.'Y24+h')37</31&83##&0#),H(?'&?/1##%#&&#%''-%&&&#(&''&#.-'%#%%(,')*'&#&#'##%(%(#%('#&##%%%%('%#%#%%#%#&%##h>w+v<ayvyvcg.uuhKr}g/v|g>u9i[~>g5uI~=RvdwEg;v/g;uk!!TTSx]@RT!U!#!@VBRUU!'UTe-d0c`e&gSdicedFcrdTaqb.kYcAohdYd@a3e+d}dMdtd.aJ#bqcK`dle/e.e'dwdPdodddjbEb}ogd^ofdpduc6j?l%d{drdqc)d7bacOdQ%T#Y)X.sR[yH>6Vyv3[xwLu>vo'!*.[yBacahoj>6Rew3[xqdZa#!a&#^(X-[yG>6Vyu3[xvg3sEr|g.u/Ri9db0T#^(Xa)!-[y;>6Vylg4wKs{JwNZt3@3r=c4Z([xlg;wKt!cpq's@v7A'*a(a+!-a#[y<3Dt?3Dt'>6Vym3[xmg9rxsNJwLZt4~?r?db1T#`-!(Xa,!0[yS>6Vz%NuQs.g4wKtnJwNZtS@3r>c4Z([y%g;wKtrdga8!a(!#&T*Y-Xa#!a0<or[yc3Dtq>6Vz43[y3JwNZtf@3s!Ju}!%Dti:pm3c_%X#tjB5pkd6q!r]u?voC'*-a.a2!0a&a+[yI3DtI3Ds~3DtH>6Vyw3[xx;:s#~<5pKJwNZtE@3r~d`a)!a2T#a.(!+U.X1[yT3Dt`3Dtv>6Vz&3[y&g9rxwzcxstPu.<rAJwLZtT~?r@dZa%!a.&^*Za(/Reu[ya>6Vz23[y1g3sEr}wkg{NuQRg{ci(U#5@b`~,cg#U(2WnH5wugcRh7dX#T(Y,a'Ta!!a,[yZ<]mj>6Vz,3[y+Pv#5ReZKu+=,%!H}7ABwkaS?Rh:BcW(X#<]mrj:ubv/ARekdg%!(!a.*Ta(Y.X1!#sP>Rl*Dt6[y>>6Vyo3Wf*jOvuumvuRgRJuq*!:9<B@bX~3jVv&v@s@5Re[d/rQt{uAvo&a&a*)a2!,0Wf!3Dt0=Bs'>6Re}3[xy~<5s%JwJZt1~Gs)c;&!#2sJkNuXvzq7rxu,Re8dka4!a8(aEZ+a@Y.X1Xa)[yd=Bs(3DtP>6Vz53[y4cX#X&Re:avRe9~<5s&JwJZtQ~Gs*i^rzvdRg+Jv{%!2sbB@bX}kdga,!Za?&^*T1/!a'Dt+[y6>6Vyf3Wf%g/u;s4hGu6?Rh-JvZ,!c%#&RoX54Rivj7uyvf8RgTKvZB%*!2sGh<vu5Rgq<=C::9bb~#dZ#T&Ta6Y.X*Dt>[y93Wf)coZ(T,6VyifluvRgC@95@B@bX~/hFu34cC#T,k/unq8w8Q5RkUklwQuzunq8w8Q5Rk8d/rJu?v8w9)-&!a0a;a&aIWejg3sEr/h1s<DtDJvyZqY5aws3Jvy!&Wei~Hr1:au5@Bag>23E~5c:Z&bX};kKv?w&unuVu5Rjc;>bs)#~@:Rh.=ay<a]C;b`}Vd6s/t{uAvoaxa()!a,a7%-a#a2Dt,[yF2Wo[>6Vyt3[xuNuPRi&NuPwpi#RoWh?vf8Ri%Jv]!%Ri:KvxD!.'2WeAjZu`q9rxu,Re7woeAg-unLq(qA_/*2Wg_g3u5q^9:4E}/jTrxrzv=Wkkd~0UX#^^Xa-a1a5T&a=U1a'*aEa]!a*aPaA-adok[y54Rn>;:p3~Dp5g9rpsFNvZqjg3uJp4~<5p0Pw;5qlJwNZt*@3p1Pw:5p/Ou!5p2JvG'!6Vye=<qnJvh_[xhg3v,Rh3kOwOw-sDuev/Re^dha[a%!%!a+#Ta7)-5TaCaO!aka!a)sf[yb2>Rl!9ARiq5E}Qg=ucRkBE|oJrJ_@Wk~@Wk{JrJ_@Wk|@WkyJrJ_@Wk}@WkzJvO_[y2g-vMRmiKuYC!)&>Ri;>Ri<@3RkNc](X#@9Rk=g5vuRmhKvDB!+'=]meg3u4Rmgd)#Y'Vz3CARmfd`a+!%T'!+#Ta1Ta6TaM-sTDt9[yA9sYd'%Y#s[[xpj:ueunaXRgEjRq,v-vuqdd2'`#6Rev<32@5>:2<E}5xIo9a*X#Y(;5RePJvD_g>vyRgNj8w)v8<wggs:RgXiZt|vjx,hSq3ah!-(~@:Ro/Ou!5RhWj^v(pyw8unRhUdx-UY#^Ua.a3a70!)%UX1TaDa)'omRiRRhE[y:3Dsz=Br,>6Vyj3[xkg6ruwjcqsrPw;5r*Ku]D'Zt-@3r(~?r.i[vwv]dU1a--U#`a4(g/vsRhPOu!5RhLj:rmu9Wo!~@:wdh@g/vsRiTjXuvvNr}:RhBj^v(pyw8unRn]dz1UYa'a+^Y(!aETZalaRY.Ta?a4[yDJw1!#qLsW>6Vyrfzq-pLflpwRe|Js>%!Dt@3Dt&Jvy_[xs~HrnjMuwpsw'RecKu+D#'!t<~Grl~?rjg5u-x,gwp{ah!-(~@:Rg~Ou!5Rh'jXuvvNr}:Rh#cW#X/c;&!#2sLi[v7u7RgpJv)(!iLrxu,Re6j7v@s@5Se[e7d`aW!Za(a`T.a#!a3!&aDa-!9)Dt_=6s+3[x~~DR|h~DS6avhGun5RkZj3w)v-]mkKunB!&*]kb97R|i<ARk<c:Z(6Vy}Juh'!wziMRoS:F|vkLuauJv5vtvQRh1d='T+Y#VyO~DR|jcF#T'7R|g97R|kJv3'!ay<Rj,Jvh&!:ReXcsa6*a+#a#_aIRf9aLRf?c,Z&Rf5Rf7c.Z&Rf;Rf>cQ#%T'p-Rf8Rf=ct#%'(*!,p,Rf4p+Rf6Rf:Rf<d~'Ua%U*^UYa(!a,-!#a4YaTalaEX0a8a<Weo3Dt/3Dsx=Br93Wen~Dr;~<5p<JwNZt2@3p=Pw:5p;Ou!5r3c7&!#:p>3Ds}KvGB)_6Vyk2sM=<r7x'eovA(!hFu1ARf}cV#X&@r5j6rvwQa^Rf3c=Za'wkghJv__g;unRggA53B9=b^}%j6uduo5Jq;!(hIv%2Re`Ou4ARe_e%a#^^^Xa&!a*a2!&a6YaP!*ad!#a:aE/5Rn?[y@>6Vyp;:pE~DrY~<5pBJwNZt8@3pCh=rt3rWPw:5pAJup_[xoNuPpF9c!#'45pD5ARn)d8#X'X*3@rU72s]h>v<<sSjJpqvewOJq/(!hNw'5ReBk0s2u3w/w'5ReE5@Jq.!a+JQ!&WeU23d(#Y&RjG5]jBk!u7w&u0udARjEe#+^^^Ub#!a2/a`Z(agT1!a-a;|@TaG!aS[yV=Re~fow'RguNuPRe?bz#'>RoUWeL>:Cbb|?JwPZtVg6ruRmzJvD'!6Vz(g/vmRh~Jvy_[y(g9voRgyx*cy(#2>Ri2B9b]~9kIw9u7rluJu3Rg]dI#a%UY'@=p%CAx.gQZ&RhwwygtRm{x5g_Z'+ABqR9Woa=Bp&dV#^*Xa'!&@o{g4v]Rk;Jv{!%Rk[wkkiA5RkiwwfUB=x,fUuqC&*!>RfTg8v0RfV~ARfSd;rJsAuAv9wR'ae+/aO!a@aza/a#[yQ@Wg!2Wemg3sEr0JvB_g>uvReWg2v+Re=KupB_+[y!2AbY~-~Hr2AJwD!(h<~El>h<~El?Kun@+_:9b`}Kg-v/Ri3g;vtwyk_9]k_d=&T#*U.6qh@Ab`|K9:H|CJv[!&3Dtex'fDwC%!Rf[9WlMd[(^X,!a%Z06Vz!@WgBg=v~Rgvg,QRe@awd,#Y+jTv|Q~EfWj]uNr|~FRfXdy#Y&^Ua%!aO.!(a)Ua;=!a@aKap!a-,a!Ta]a[rSa]p?[y82sK=Bq~;:p:~<5p8Pw:5p7d'#Y'Wf(;RnRi[u4w&RgJJvG'!6Vyh=<r#ijuuv/sIKuYD'ZtG@3p9~Gr&d2#`(g<vtRgFj`u5w&rqpxRf2CJuY!+:wfnTOu!5Rg}jNs1ucv&RfwJvA!&3@q|BDcC#T,k/unq8w8Q5RkTklwQuzunq8w8Q5Rk9dga#!a'!a=#a0!:+Tb*b@aO.a4!aba8aFJv^}?!VyR~Dr<g;u%Rn.~<5p[x'e`wNZtR@3p]Pw:5pZhNvjBp.woe_g5u-r4JwF!%DtO3:ooc7&!#:p^3DtpLuGw(!+%)Dtk6Vz#2sd=<r8d'#Y([y#<x3gJt`w@!)%}MRiowzikRij=]ilxAf3,U(#B2Rf#g0v-Rm[ck{`U#]giKv3>)!&6Ri154s,KuGB_%@r68r:dJ|t`#X(9<E|u2@H|rx3gJu?w'!+'1Nu7Reg4=H~+9<wxgY95Rm]xLggZ-`(X}U2:Ri4h<uOawRmsJv__5@bb{jbV~3dka#a'a]!,#a+U=a>b6a3b%!/aKa/)!arwve^VyJ;:pR~DpTg3uJpS~<5pOPw;5qmPw:5pNOu!5pQJvG'!6Vyx=<qoJvA!{~Jup!%@qk7Rn/KvyD!}''[xz;>wkh'?Rh,x8gyt`w5D!&),(SgyccRgztJ@3pPB5p#d'(Y#<]mmifubw&RgoJvE&!82s^JvF&!8Rf,ADb]~;x=h'rNu]vK!,%'*0RnORh)4Rh*AqQg-vaRnNg;wHwkh'ba~4cE#Ta*x3gctyw@'!+%RnFRnD<4Rn@hFvK5RnCxWg[#`&a0Ua()`1Rm75Rg[c]%X#qi8Rg^NvdRj>BwzgZauwji7Rm6A4wgg]d1#&(*,.0a#Rm;Rm<Rm=Rm>Rm?Rm@RmARmBe%#^^^Xaea?aC/b+(,!a+a#!a/!>a&Ta<aKbD!2wphBRnk[yPw}hE|.=Br-3Dtm>6Vy~g6urRf.x,hPrNav!%'RnqRo%Ro#Nu;q[Pw;5r+JwNZtM@3r)d'#Y'Weh;xChL#`&RnmRnoKu}>%(!Rne~Bs-;2wjcussJv+'!aYSO}6@B<5?ba~8LrNvj!.%*ROwungw~ng~:9;Ri^>wtnig;wHRnixDh@|(UZ.x1h@|)!#:2<H|*xHn]#-UX'3Ro)z=iT}6ARns=Bwsn_wpnaRncw]aR(#UXa&Ua*a/=]iPd'#Y&Ro'WnXf{QRm2hNvj]nZd`'T~&1`{|`#9b]{}c:'!#Wl{>@=be}]?cl{{U#:5Abb}Jds#^YaF!a*b4a#a3aPa>&Tb!bH!*a_!Eau?/a&RjY<]gj>6Vz*;:pe~DrZg,QRj1JwNZtX@wihspcJvZ&!VyX9WmOJu|!|N2WmHJvh&!]ht~Bpbcn&T(!#RmQ<s7Nu;padH#X'`+WmJ@>RmKCARhnKup=!)&Wf+:RhqNuPpf9c!#'45pd5AwghpARn(Ls@w!%,)!RmP@Wfe<E|IJva!&WmNg8vsRmLd`*.`#Y'Xa!axRn*]hrA8Rhug5s@rXg8u!RmMd8#X'X*3@rV72smdI*#UY&RmICARho~GsgxVgd)Ta'U-Y&Xa!T#RnEWnA@Wffg1uDRi0hFvK5RnBxGnG&#`%owp)@wsf+bX}Ze-*1!a*^^^Ua|!#a.aq&Ya2!a>.a6!a:aO`aJDtL[y`@Wg#>6Vz12@wzoYRoZNuPRi!NuPRhzg=ucRi,@=b`{Yg=ucRi-ACJvB!&Sh[ebSh]ebi`wUuFRm4Jw2_[y0JvB!.<Ju(!&SoG}6Shd}6<Ju(!&SoH}6She}6Kur@._g5vHRieJvx!{L2G{Kx6gd'T#?Rh82Wi5cZ#X(g1w)Rm5dW-Y(Ta#!a)!#aYa=wnfE=su2>>bU{0j9udv:<svj8uQv-7RgHdE%#^'sq9sp=>Bb_{TJv`!&g/r|snj6v(us5d,#Y(56H}[978H}]Jw5!&g1rushJvB!+j;v{u5?zDhd}6}bj;v{u5?zDhe}6}ce*#`(^^^a[aea!=!a6a*aoXb1a.!aAbL!b>,b'aL!aV@Wf|2Wlg3[y/JwNZt^@3piPw:5pgJunZou3@rsJva&!Vy_g<v~Rm#JvG'!6Vz0=<r{Ju{%!:pj@WfsiXuJu3Rm:JvZ&!WfA~Bph@c4Z&Dtwax5rubx(#:awRk1@d,#Y&RfjRfid1#,Y(@Wfp2Wlrg5s@ryKu[@!,'=]ig9wlk?Rk>g5u-rqJvy'!@9RkQcH(T#=>Ri~@<wkj(Wj(KuZB*!&<7rw@9RkRcH(T#=>Ri}@<wkj)Wj)dg(Ta2Xa9X#`-!a*CARhg@@=I}d9x;c~#X%so=<sj>2@@=aybb}XjWv0Q~EfEj3vLv;<d,#Y(56H}`978H}_dgaPaFa'a/!#a3Y0a_a;a|!1(a7-[yE3[xt;:pJNvZrrg3uJrvJwNZt=@3pIh=rt3rxPw:5pGOu!5rpJvG'!6Vys=<rz@c4Z&Dt(ax5rtJvZ!&~BpH@wsfNg-vaRlNci*U#=<wei<F}a5@Jq.!a*JQ!%@qZ23d(#Y&RjH5]jCk!u7w&u0udARjFd/prq=tyvpaEa(a:.!a1aZ(@@=I}:9wpd%=<sX55w_h}@@=I{t=ay<aU@@=I}T=ay<2@@=I})?C9:9au@9Cb]}DP~=x-fAZ(2Wl1=ay<aU@@=I}>5@d##Y+jTv|vV~EfFj]uNpn~FRfGdgaK!Z2&!a8a-Tb({E!acTbM*!a(DtY[yYd'%Y#sl[y*hHvh>Re5x2c{Z}.j4uCvcawRiMd+#X+_x&d!},<5RkX;2Hzw@x,gavfB-!{CcF&T#Roe;RodwWbBg5urRgaKvHC*_6Vz+<4opieuew&Rmq@d]&Y)X,T#X0Rh}<BqP=4qS9:ReMg/ujReNJw0!/<Jui%!bd{kawwnemRelAxUa?a3#*.&UX(Ya+a/RhvRnQ<o}9Wmtd-#Y&RgSRmw9;Rmxay=Rmyg-vaRmuxEhSrNu,v-voC!%(aR.a(a7+1Ro1>Ro5CE{A9b]{@;5x#eO{:g;urRi+KrNA!%(Ro3>Ro79;Ri_Ku@>{;&!x%gX|{KunA_+g5QRj/g3u5Rj#g>uERj%wio/xRhS&!,!#^1U}wba{8>>@=be}qC@:D5ba{7Ku+A&!}x?ba}t>>@=be}se(aA^^^Uat!b0#{pa+awUazbGa#aLb9bgaWac'a5TbS=Br!d1#`%scp_Jvl!#rT>Re0JvX&!VyN=H{Fcm#U&:pY=ReaJv2&!]h0=]nUJvG'!6Vy|=<r%JrM_=]h2@Wlud'#)U'Wf'b]{i=]h/Jvh!&~BpWg=v]RnMx+ny#'Nu;pVwjnu=]nwxJnx,T#`&Reqwjnt=]nvieu9vrRjLLuYwP(#+!th@wih5pX~Gr'g5v/Rh4KunA'!-CARnP@wwiN:Rm_9x'cvw>!|l=<saKvAA!0&3@q}>w^e1bp#&Re2Re3BDx7gH#T|f5H|eKuZ>!%(:qNAH{]Jv6!+3B2B9=b^{X<5<B92:E{ZLvhwA(a;a%!igQuyRmad+#Y}m@3Rh5d8#X'X*:AqUAHzmaxwbh<aXRnVcF}RT#Nw&cj#U(BWnug/vsRntdka)(a3+.Zb7aYYan1!bVa@Xa}[y^@b[{G=H{+hFu73Rj&Pv#5ReQcK%T#sig1v{Rj'Ku+D#'!t]~Grm~?rkKuMB!01d5#`'Vy.ta3Dtu~Hroc8#'{^45s85AwZbP&!#Rn!wghxWn#KvEA!)&2RlA2RlBx:h|#(T,=]j09Wobz>x]z/@awRoTd+#Y(az]hFhCrm4d,#Y+jTv|Q~EfMj]uNr|~FRfOdCa!Xa9_X#@<plJvf!%b`{(9;Rgwc;.!#2x7cw#T|UDb]|T5Ju={(!=@E{&Jv)&!Ab`{'awJvf!~*>>@=be{#KuY>!+&4Ezyi[ugv&RjIdea+T)#UXa&T-T&a!Rh9auRmW=]kLg5vuRn+g3u4Rn-Ow6ARn,hHus5xNk?#UX(U~)/g8v0RkD~AwkkF?Ri.OuNBwkkA?Ri/d|a2`a*^UYa.!aBTZaTa'Xa;!(!2!-a#b2[yC>6Vyq3[xr2Wi?g1rusVh%s?DtF~<5rbJs;%!DtBfswKtCj[uvuSsEu3RgVx3o:u+wN'*Zt;@3rd~Grh~?rfg8w)Lq)qE&-a%!>bI|`jWv0vV~EfCjTv|vV~Ef@j]uNpn~FRfBcK#T']gWNu7x,k7q4ai(0!hHv8<RhmkMu9vrsBuev/RhlCJvB!,g<v{wchh~@:Rhji[vrv{wchi~@:RhkdS&a5UY#Ta!RgPwwiI5BwciI~@:Rh`x'iJvj'!5]iJPu8Bwch]~@:Rhach)U#h3rp]gLh@t|Ax,hTq3ah!-(~@:Ro0Ou!5RhXj^v(pyw8unRhVd|)`,^UYas!a?/a2Z'a^Ta{Tb7Ta(a#!a,Wf&9sZ3DtAadamov=Bqt3[xig8vsRm~>waiL2b`{QJv*_Ouv2qgj<v]v2BqfdR'X*X#Y-@3qr~Gqv~?p6hHv-]glPup5Lq+q?_%*b_{qF{n9b^{rOu4ARhpKvCD!+&~Bqp:5Dbb}nwoiKl&unuTuBv]v+ueunaXRf0=Jvh!0nKufu8v1w&w7q%w&uHrz:Rgnj5w,uxDJq/(!hNw'5ReCk0s2u3w/w'5ReFd>Za&!*UaA=<wkgsRnSJv^!%Refifw3vyRgOKu_B'!,<]gkiiu:w&Rh<=C@a^<B57@2F{[<B5@aW:=3away9A5aW=<B=C@a^<B57@2F{Ie-#`(^^^bCara.b8aza6!/bZ,!adTbnTbOb+aFaS!aAT9@Wf~2Wli3Dtl2@d,#Y&RfnRfmJwJZtN~GqyJva&!VyMg<v~Rm%iXuJu3Rm9Jv[_=]ih9wlkDRkCd1#`(@Wg>2Wls3cH#T(@<Rj*=>Ri|b~'#23s9h<~El.d'#Y&Dtxi^rzvdRl#d*#U%(o|B2s`hJwSaxRmDKv4B&!1:Rmdd5#`'Vx}to~Hq{x'f1v3(!BA5ba|bJv_&!Wfug1v]ReIdO+U/Y#&G}-8wze=Rh{g1v]ReHg/uQRf/by#)ibQwERl/cH#T(@<Rj+=>Ri{cNu+vlax-!(#a0qa9<Rii2;;bU{H;x<i=&X#Rk`<4wwi=C9H~8xAI(Y#<azRi@45wXI<B9;5bb~7dL(X#Xa(+!aL6Vy{g5QqOau:5au2@ay547EzbxOcU(UX-T#Ta#:Cbb|A?wjh/b_|SOw6ARgtihr}u7Rhy<d1#T)X1@@=I|~=ay<2@@=aybb}Sj3vLv;<d,#Y(56H}A978H}@dGpvs@uAu`vcw9*!aFa+ai%(b!aXa8.a?a[ozWey=sU2@G}Nch&U#Rf_WexKu+D#'!t:~Gr`~?r^j]uNr|~FRg*j^psurwJt|RmcKv)@&!)7Rkv~Br[@wxfO:Rl3co#U'6Rezj_q#vIuavjRltwzeyh@vr5JqD0!>aY?C9:9au@9Cb]}9cl#U*5;5<H||jbuus1ucv&Rfvg1v~d/pppzqFr^a--a~!aMat1(hFv;Wiz@@=Izoj5uuv-7Rix~Cw`fk2WlVcZ#X,k)u3vWs@u2]ktg;wEx'fBq(_2Wg/jTv|vV~EfoJv]!15x'hzqG!(P~EfU~CRl_j6v(us5x4i-#T(2WmZ?C2F|d>Kq<aj1!*jTqIsBv=Wl`~Cw`fi2WlWj`v0u*~>RlR=c>Z,k#u3vWs@u2]kr<c1Z+jTqIsBv=Wla~Cw`fm2WlXdmb3!a{(arZa`bkTa%TbQTa-a9+c'!aM!/[yL=Bqug.w'RifhFvyDRj.g>vgwyk^9]k^Jv3_@WfbAARkhJw2_[x|JvB_wkoIRoKwkoJRoLd'(Y#<]gm=<9<H|yd'%_X#skDtb3awwqkgNulRkgdB#^',9:p'hJwSaxRmEBwVb8@4=H|qLu+w50&!)@3qs~?pU>Awwn;;Rn=c:Z'ARn<=<qwKvC@!/&~BqqJv6!&]eVb^z^xRge'/a%+^`#Sge}6<4Rn3=]n0Pw2>Rn8Jw0!&>Rn:>Rn6cY#a7+!a&=<wkaNw~h3z_c5Z{=wjh#=]nLKv^D!&)Vyz=bW|swYb<WetcG#T(2wxa@qVx@gD#Y&b^|V5JwG&!5bb|pg/w&RgD@x=kHs=uAvn!a%%/'+RmSRh694Ro`g-vaRmRhHv-]mlxCcS#`&ba~.5cD#Ta)P~=d,#Y(56H{>978H{Dd_#{2^Y%_+qbbb{6g3sERhsbU{?dfa.,`a(Xa<!aiX#(55RiG54RiHcI#T'WiU3RiVNvdwtfcRlKNvdd,#Y&RlHRlExQgf.1*^T'X#Sgf}6Wn4=]hfPrk>Rn7Jw0!&>Rn5>Rn9Lunw?&a2!,5<oq@@wqfdRlJj5Q~=d,#Y(~ARfcOuN]fdDKw;ay(}i!547E}j?cI#T(@5bV}iCbV}hdv(^^Tb?a40,b##Tbo!a*bR!a<b|a/!aKai!aU[yK=]o^g:v>ReGJwPZtK<7Rh+h<~El,Pv#5ReR@awwxjCg,ulRjDJv6&!]j!z?aQeeg>w=Sh<eeJw;!&axEzOg,Qosc!#*:wkeJ]eJ>x'h-u(!%Ro.w~h.zPdNZ(X,Ya![x{;9ReY;wkgxRiF:x?ap#Y&RmUg<s2Rkod]+UY0TZ'!a&A9sw<=bczLNvuw{gqzNhJwSaxRmCKuLay!#&s_Rf-55b^{uJvZa!!c%#(55Ri654wmiu5RiuawLu,vp!+}^%b_}Y9;wkgxba}o>A9:=b^}zKuh=a''!3awRk3c*'!#aHRk6c+Z&Rk5Rk4Jv)&!awRjSawd9*`#0?C2@EzMj8u<uJ5RmbjQrquJu3x,k>uq@_+=ayb^|W~ARkEOuN]k@7dhzV^X/X&a-#zRzSb`zXcJzTT#2WkVKvDBzW!%FzY9;5bbzWjQrquJu3Jw3%!b`zU=ayb^zQd:#X(T-a!6Vyywxh}=b]{Jg=u1RiAdGp~qHtzv!w(wA+a+a;<!aJaYai'anasb(=azRmV:Cbb{MLq2vb!%')RjuRjrRjtRjqx3jnqCw3!%')Rk(Rk+Rk&Rk)Lq2vb!%')Rj{RjxRjzRjwLq2vb!%')RjsRjpRjfRjex3jcqCw3!%')Rk'Rk*RjkRjl9<CbbzfOu4ARhxLq2vb!%')RjyRjvRjhRjgx=joq*uKvb!%')+-Rk.Rk%Rj~Rk-Rk#Rj}x=jdq*uKvb!%')+-Rk,Rk!Rj|RjmRjjRjidAq&qKs@uAv8Aa.'*-a@a&0!aM@a5[y73Dsy3Ds|3Dt):wxgI2sHJwJZt.~Gqxwsf0ikrzt}Rl0Jvy_[xj~HqzKv_A|D!&WfP8axRoVcf,U#k(v]v+ueunaXRf1Ju}'!g8u#Ri=jQw!sCunLprq>!,')~<5qeGzq9F{W=c##%s5au:5aU3CBE|;d4#X(D!a&6Vygx(b;#(=]ed?C2F{N<capoq2r[a&!aPa9,'Pw;5s:@@=I|,55w_h|@@=IzcP~=x'fCqB_2Wl2>aU@@=I|1OuNBc1Z+jTqIsBv=Wlc~Cw`fl2WlZ~AcTa%!Z+jTqIsBv=Wlb~Cw`fh2WlYk+uNqJsBv=WlSg,u3dca3#UXaMYa)TaB-=cM|7T#<bI}l5@B932:aV2G{BOuNBJq:|M!5Ezt=<B=C@a^<B57@2F{v>cB{/T#=ay<bI{3Jv6!a.6BKq0ah&+!5E}HP~Ef{978BaU@@=Iza<7d#.Y#978BaU@@=IzH~AJq0!(@@=IzG978BaU@@=IzFe,aU*Y&^^^bvJb,b:bFad!a,c2Ta>aL.bo6!a#CbTa'T#Re{2Wlh2@G{yg6t~Ro_NvdRfticuRQRllJv3&!x&c|zs@Jw3!%RflwpfkRlpKuL;%(!Re<@G|C2GzdhIvuBwgjAg-u0RjAKQB%!(GzZ@G|5NuuRl7d='T+Y#Vy[g<v~Rm!==G|>JvA!)@wma=]m1ifuaw&RmnLs@vT'!|/+[y,g:v>ReTJw1!#qX=x!eC{bLu+wT&)ZtZauq_~Graci&U#F|89:r_Lupvq!.)&2RlG8RfaC=x!eF{_h?rpWlmd&'!#X|&]k::xJey#`'T|+<E|&2@H|%dE#(^,g;u.RiEg6vjRiC9xCkA{O|zY#g=ucRmXKs0@!&*@G|m@awRknJuh!,3d(}gY}eJvj!%Rm):Jw3!%Rm+Rm-Ls0w(&!a(a#@b[|6cZ#X'7RkxWgAOu4ARn'dH'U#Y*Vz-Wm'CARm}d]*#a%^a*T'aK!a<9bV{PC=p*Jw4!&SgxcbB5r]idw(wBRmF7xFkt#&`(Rm/Rm8E|!JuY_9:Rl5=wrgr2:bbxd@xXfB(a*#T+!.X0X1Ta/a'T&RlDRfL>RlyARl9b[z[>RfZ:RlL:RfRwlg/ARl;9;RlxKv,A/!%7s69<74=BA5ba{-8Bde#`a<XaKYa1,a'P~=wxfB2bZ}}?C972@@=I}r8@55B9;5bb}G978B2@@=aybb}3j3vLv;<Jw3&!>Rfk=ayb^}4~Ad1#`*@@=aybb{w2@>==<bbz]dx+UY#^UaF!a9!bB'Ya1.!ajXa#%olRhD[y=3Dt#Ov5BrHKuMB%!(Rf^Wep~HrJwkiQjKr|~FRg)Ku+D#'!t5~GrF~?rDdV)UY,Z/_7RkuG{<~BrBg,rlsO:235B@bX}|d?a1!#`(6Vyn5@d##Y+jTv|vV~EfIj]uNpn~FRfH7Lq2vb1!a9-978BaU@@=Iz9978BbU}#~AJq0!(@@=Iz8978BaU@@=Iz7~AJQ|}!978BbU}!JvkaK!AdUa21-U#`a+(g/vsRn~Ou!5RPj:rmu9WhOjXuvvNr}:RhAj^v(pyw8unRn[kPr}p|u7vwv]RiSBd;pppzq@qHQa?(b.!a.a`@.|xa(hFv;Wiyj5uuv-7Riw~Cw`fg2WlU978BbU|wOuNBJqG!(P~EfD~CRlQcZ#X,k)u3vWs@u2]ksg;wEx'f@q1_2Wg.j]uNpn~FRfqJv]!15x'h{qG!(@@=IzK~CRl^j6v(us5x4i,#T(2WmY?C2F{1>Kq<aj1!*jTqIsBv=Wld~Cw`fj2Wl[j`v0u*~>RlT=c>Z,k#u3vWs@u2]kq<c1Z+jTqIsBv=Wle~Cw`fn2Wl]dn1#c(a(b^a2!b/bAT(bj!aDa7bu,a_a{c0!2T0g:v>ReD2@G{42@G{5~DpM~<5rc=Bx6i>{RT#RnI@zCx]y]z:2Jv[!zr5Awyk]9]k]dD(Y+X#6Vz.g=wKtgwhaCwgmTWj2Lu,w%_+/[y-B;b^xeg3u3Rj-2@bX{*KrJ<!+'@Wg(g?QRlC@Jv`!%b[zIwsfII}8JQ_@w|kW|=Jv(%!AqcOuNBJvEzh!bYzjLs@wP#(0!oy@>RkdJwMZtc3Dtd@BcG#T'9bWxg2@2Fznd*#Y+;2x'c}w<zizixNgwa#Z'U+!/!a'!a+w~g~z6wcn{Rn}wcnzRn|5Rh%=]nJg5vuRmvNvdRlvcprJu}w*az*a#!%.a.'Bot9qT]kj@Wg'ay2Gzv@Jv`!%b[zEwsfHI}1;ck#Ux`<Cbbx_Lu+w!a&0*!wko*wwo,So,}6Juqxf!E}PigQuyRm`d3(`#8>Rn%:A5B;bZ~%KvhCa!a2!x>k7#Uxb@b{#xaRk7Jw0!)>wwhlShl}6>wwhmShm}6CJvB!.x'hhvj{!!5Bwkhhbaz}x'hivjz~!5Bwkhibaz|xEhTrNu,v-vpD!a%&/)a3a.,%Ro2t[CE{)@3re9b]{%wjo09:rgc:Z&Ro6=<riifuaw&RmoKrNA!%(Ro4>Ro89;Ri`dSaL'UYzxZb)7Rka3xRhT&!,!#^1U}vbaz{>>@=be}yC@:D5bazzKu+A&!}{?ba}y>>@=be}wxBh[t`u~vJvr!%a!a()a,a0a4RoC=]o;Ju(!%RoGRhdwjh`=]oAg>w#Ro?g5vuRo=NvdRl|Ku]C.!&;RoEJvB!%RoORoMBx'h[v+_?w~h`}~5?w~hd~!xKh]oiptu-utv.vp!#%&a30a@a'a+(a/aOp(o~p!RoDJu(!%RoHRhewjha=]oBNvdRl}g>w#Ro@g5vuRo>c[#X']o<CauRoRAd-#Y':RkpauRoQKu]C.!&;RoFJvB!%RoNRoPBx'h]v+_?w~ha}t5?w~he}ue!/UbhYacXaW^Tc&a;b:a-c/#b&aja1(!cL+!bKbt!bmcRc9aIc?8[yW3Dtt94Rg`Jv}!&SiRMzBhEebShEMNuPRe>x7gL#TzuwjirRipc<Z&>on;>z=h-MSh.Mwqczx'a7vj&!>Re4@=ResJt__NuPRi*NuPRi)j]uNr|~FRfzKrJ>_+@Wfy@Wf]2WocKrJ<!+'@Wg%g/QRl@@Jv`!&awRl<wsfFIzgLu(w*!.*&ShBMwvhIRhI9;RhNx1hK'!#Sn]Mx1hK~0!#:2<H~7cNu+w7D*'1ZtW>Rn1~?rOc:Z&Rn2=<rQ<7wjh&=BSnLMc]#X(6Vz)w[b=a!U#9wzgMc3#&(RgMRitRis<x,gKt`ax!&+SioM=BSilMc3#&(RgKRinRimKurB,!&SiQMzBhDebShDM6BJQ!(P~Efx978B2@@=I}WLrJw!!,a*&@G}O@9wkibRid@@x'fKwC!&SlDMSfLMjUv~Q~EfKKv3@a+!(hFv-]mpx/hYZ(C5RiWz<o/MwkhY?So/M@x,gbvfB*&!SgEM:SoeeehFu3:Rgbda(,^TZa)X/7Sg[eb:2RgI~BrMC@wgkc:wwkcRerx3h(uUvK!&*,SnOM4Sh*MArRg;wHRh(x=h;rJvPwI!a4',a'0@Wg&=BSh/Mg>w=Rh=g3w*wwgGRgGcW(X#;Sg}M2Gzk@Jv`!&awRl=wsfGIz`dKZ*T'Y-:RhR7RhQg5u-p`j6v(us5d,#Y+~Awkia?RicOuNBwkibba}Ld6p~tyu_vbAa'a+!a/'a3aEa8a!>Sh,ebJv{!&Sh@ebSaReb9;SgwebNuPRi(NvdRl)NuPRi'hHu^<Rm^Jvv_@Wl(g;u1Si/ebKu'B&!*Sh?eb@Wl'z@aPeb95Si.ebcpputyvjB)!,&a+0a%ShAMWeK@G}C@WfJ9;RhMwvhH9w{ia}ix,hJvRA1(!zAn[MRhHx1hJ~*!#hFv(BSn[MBJQ!(@@=I~'978B2@@=I}2db.Ua<'X}+T#a0XaG2G}E;wkg|wuh!Rh!x,hZu,@)!&So0MVy)C5RiXACJvB!&5RiY5RiZg8w)cG}*T#2@bU}=KsA>(!a.3wkhZba~(x,h^u(A!&(SoCMRhb5Bz=h[eb?w~hb~6x,h_u(A!&(SoDMRhc5Bz=h]eb?w~hc~6e)aA1T#T,^^^c-bMb&blcPaP(a/!0!bA=b5c@a(!bfbrc#2afwmhARnjwchORnp2Wlf3DtsNvdRl-2@wpa<]m0bx(#:awRk2@Jw3!%RfhwpfgRlnKQB%!(G{V@G|'NuuRl6d='T+Y#VyUg<v~Rl~==G|<Jv+'!aYShC}6@B<5?ba~8@Jw3'!g2QRljhLrpWlOd+#Y'g.w'rIg>w*wgj@g-u0Rj@Lu+wT&)ZtUauq]~GrGci&U#F|39:rELrNvj!.%*RhCwunfw~nf~:9;Ri]>wtnhg;wHRnhx3hDs@v~!/+'@Wfr@9RkSNu&Rlo=@<5GzoKs0@_+@Wl+@awRkmJuh!-3d(}pY#qWJvj!%Rm(:Jw3!%Rm,Rm*de&!1U-U#`)Re;@G|.@9Ri82@wjfvRlq=@<5GzpLvOvr!).&2RlF8Rf`C=x!eE{.Jw3_g2QRlkhLrpWlPde(!#U{s,UXa*Ta'[y'g:v>ReS;x0PZ&RnlRnn~HrKJw1}f!=x!eB|2w]aP(#Xa&a*Ta.Ua2a7=]iOd'#Y&Ro&WnWg;u.RiDg6vjRiBNvdRlzhNvj]nYJuW_2Wm3x)kFze{9d])!a.!,Y01!#&aC!a3RndC=ox~BrC@2b^{pg,rlse7x'ksuq!%Rm.E{xidw(wBRmGx9o+)X#wwo-So-}69:Rl4@xSf@a#XZ'X)X,Ta(/ARl8b[xc>RfY:RlI:RfQwlg.ARl:9;Rlwdn'#^XafaQa1X1TaHTa)@b[{zcZ#X'7RkwWg@Ou4ARn&x)kG#{,g7u/RkGdH'U#Y*Vz'Wm&CARm|bx#(A]gUbUzJj9Q~=d,#Y(56H}l978H{U7d,0#U*2>ABb_xZ978BbU{e~AJQ{g!978BbU{hxMh?ad{oUYZ.x1h?{l!#:2<H{mx3n[t{vl!,&a%3Ro(z=iS}6ARnr=Bwsn^wvn`Rnbd`*T}B0!#^X'BG{c9b]{a>>@=be}F?JvS!&BG{d7BG}(Bde#`a1X,Ya@!a'P~=wxf@2bZ}I56B2@@=aybb}08@55B9;5bb}<j3vLv;<Jw3&!>Rfg=ayb^}&OuNBKuLA!)a!P~=x#fD{f2@>==<bbzl?C972@@=Ix^d6rSu,v7w*C(0a)a6#B+a%!sQ[y?3Dt%3[xn~<5rLOu!5p@Ku+D#'!t7~GrP~?rNKvlaya7'!h+v-5qMg=t|cd,U#5AAaa5Abb{S@52B5@a[@52B5Gx[iXueu;d<#`a(!/549C;ag>23ExY5@Dah89b^~689Jv)!~2b[~1Lv'w(%*!a#bX|aPrmawRe]keu7uhv-q6rxu,q`xTo]/a5aU!bNaDXbi!b-!ao!b<bwA!#5@B932:aV2G|:d-)Y#hJrL>RhG<7@C5<H|_=Cau:5aj5@B932:bJ|ng>vIbs)#?C2F|9jPv0w.vISh-MKvUaz(.!9ABbb|[5;5<H|Eg>unwfh;9:4E|YjQsBt|vjx'hYq3!(?C2F|J:2<BaY?C2F|GOu!5x,g|p{ah!-(?C2F|c9:4E|OjXuvvNr}:Rh&i[w*t|cd+U#jJvsu)vsSn~Mkfrmu9p}u7vwv]So!McW#Xa!ax5@A5aY:5;5<H|>kJv~vYrquJu3x4ib#T)2@SmZM?C2F|Bj:rmu9@xPhI(a*a#U#`a3-5Abb|L~@:RhK9:4E|0@52B5G|#C::aY?C2F|-:2<BaY?C2F|.5Jvk!a)javYrquJu3x4ia#T)2@SmYM?C2F|HAxPhH(!a#U#`a*-5Abb|4~@:RhJ9:4E|R@52B5G|F:2<BaY?C2F|Sc^#Xa2j=Qq5CJvB!-g<v{z;hhM?C2F|Zi[vrv{z;hiM?C2F|XKsA>!a)-g<v{z;h[eb?C2F|]i[vrv{z;h]eb?C2F|^iZu.vix,hZq3ah!.(?C2F|QOu!5ShXM:2<BaY?C2F|P",13494,2713,49,25,61),F;(function(e){e[e.VALUE_LENGTH=49152]=`VALUE_LENGTH`,e[e.FLAG13=8192]=`FLAG13`,e[e.BRANCH_LENGTH=8064]=`BRANCH_LENGTH`,e[e.JUMP_TABLE=127]=`JUMP_TABLE`,e[e.VALUE_MASK=8191]=`VALUE_MASK`})(F||={});var I;(function(e){e[e.AMP=38]=`AMP`,e[e.NUM=35]=`NUM`,e[e.SEMI=59]=`SEMI`,e[e.EQUALS=61]=`EQUALS`,e[e.ZERO=48]=`ZERO`,e[e.NINE=57]=`NINE`,e[e.LOWER_A=97]=`LOWER_A`,e[e.LOWER_X=120]=`LOWER_X`})(I||={});var wi=32,Ti=21,Ei=2097151,Di=2047,Oi=0;function ki(e){let t=e>>>Ti;return t===Di?Oi:t}function Ai(e){return e-I.ZERO>>>0<=9}function ji(e){return(e|wi)-I.LOWER_A>>>0<=5}function Mi(e){return(e|wi)-I.LOWER_A>>>0<=25}function Ni(e){return e===I.EQUALS||Mi(e)||Ai(e)}var Pi;(function(e){e[e.EntityStart=0]=`EntityStart`,e[e.NumericStart=1]=`NumericStart`,e[e.NumericDecimal=2]=`NumericDecimal`,e[e.NumericHex=3]=`NumericHex`,e[e.NamedEntity=4]=`NamedEntity`})(Pi||={});var Fi;(function(e){e[e.Legacy=0]=`Legacy`,e[e.Strict=1]=`Strict`,e[e.Attribute=2]=`Attribute`})(Fi||={});function Ii(e,t,n,r){let i=(t&F.BRANCH_LENGTH)>>7,a=t&F.JUMP_TABLE;if(a){if(i===0)return r===a?n:-1;let t=r-a;if(t>>>0>=i)return-1;let o=e[n+t];return o===0?-1:n+i+o-1&65535}if(i===0)return-1;let o=i+1>>1,s=n+o+i;for(let t=0;t<i;t++){let i=e[n+(t>>1)]>>((t&1)<<3)&255;if(i===r)return s+e[n+o+t]&65535;if(i>r)return-1}return-1}function Li(e,t,n){return n===1?String.fromCharCode(e[t]&F.VALUE_MASK):n===2?String.fromCharCode(e[t+1]):String.fromCharCode(e[t+1],e[t+2])}function Ri(e,t,n){let r=t+1,i=0,a=r;if(r<n&&(e.charCodeAt(r)|wi)===I.LOWER_X)for(r+=1,a=r;r<n;){let t=e.charCodeAt(r);if(Ai(t))i=i*16+(t-I.ZERO);else if(ji(t))i=i*16+((t|wi)-I.LOWER_A+10);else break;r+=1}else for(;r<n;){let t=e.charCodeAt(r)-I.ZERO;if(t>>>0>9)break;i=i*10+t,r+=1}if(r===a)return 0;r<n&&e.charCodeAt(r)===I.SEMI&&(r+=1),i>1114111&&(i=1114112);let o=r-t;return o>=Di&&(Oi=o,o=Di),o<<Ti|i}function zi(e,t,n){let r=Ci,i=e.indexOf(`&`);if(i<0)return e;let a=e.length,o=0,s=``,c=r[0],l=c&F.JUMP_TABLE,u=(c&F.BRANCH_LENGTH)>>7;do{let c=i+1,d=e.charCodeAt(c),f,p;if(d===I.NUM){let n=Ri(e,c,a);f=ki(n),t&&f>0&&e.charCodeAt(c+f-1)!==I.SEMI&&(f=0),p=f===0?``:xi(n&Ei)}else if(Mi(d)){f=0,p=``;let n=d-l,i;if(n>>>0<u){let e=r[1+n];i=e===0?-1:u+e&65535}else i=-1;let o=0,s=0,m=i<0?0:r[i],h=c+1;trie:for(;h<a;){for(;(m&(F.VALUE_LENGTH|F.FLAG13))===0&&(m&F.JUMP_TABLE)!==0;){let t=m&F.JUMP_TABLE,n=(m&F.BRANCH_LENGTH)>>7;if(n===0){if(e.charCodeAt(h)!==t)break trie;i+=1}else{let a=e.charCodeAt(h)-t;if(a>>>0>=n)break trie;let o=r[i+1+a];if(o===0)break trie;i=i+n+o&65535}if(m=r[i],h+=1,h>=a)break trie}if((m&(F.VALUE_LENGTH|F.FLAG13))===F.FLAG13){let t=(m&F.BRANCH_LENGTH)>>7;if(e.charCodeAt(h)!==(m&F.JUMP_TABLE))break;h+=1;let n=t-1,a=i+1,o=0;for(;o+1<n;o+=2){let t=r[a];if(e.charCodeAt(h)!==(t&255)||(h+=1,e.charCodeAt(h)!==(t>>8&255)))break trie;h+=1,a+=1}if(o<n){if(e.charCodeAt(h)!==(r[a]&255))break;h+=1}i+=1+(t>>1),m=r[i];continue}let n=m>>>14,l=e.charCodeAt(h);if(n!==0){if(l===I.SEMI){f=h-c+1,p=n===1?String.fromCharCode(m&F.VALUE_MASK):Li(r,i,n);break}if(!t&&(m&F.FLAG13)===0&&(f=h-c,o=i,s=n),n===1)break}let u=Ii(r,m,i+(n||1),l);if(u<0)break;i=u,m=r[i],h+=1}if(p===``){let e=m>>>14;e!==0&&!t&&(m&F.FLAG13)===0&&(f=h-c,o=i,s=e),f>0&&(p=Li(r,o,s))}}else f=0,p=``;f===0||n&&d!==I.NUM&&e.charCodeAt(c+f-1)!==I.SEMI&&c+f<a&&Ni(e.charCodeAt(c+f))?i=c:(o<i&&(s+=e.slice(o,i)),s+=p,i=o=c+f),e.charCodeAt(i)!==I.AMP&&(i=e.indexOf(`&`,i))}while(i>=0);return s+e.slice(o)}function Bi(e){return zi(e,!0,!1)}var Vi=class{src_Any=fi.source;src_Cc=pi.source;src_Z=_i.source;src_P=hi.source;src_ZPCc=[this.src_Z,this.src_P,this.src_Cc].join(`|`);src_ZCc=[this.src_Z,this.src_Cc].join(`|`);cache={};opts={maxLength:1e4,urlAuth:!1,schema_names:[]};constructor(e={}){this.opts={...this.opts,...e}}set(e={}){return this.opts={...this.opts,...e},this.cache={},this}escapeRE(e){return e.replace(/[.?*+^$[\]\\(){}|-]/g,`\\$&`)}nestedPairRE(e,t,n=4){let r=this.escapeRE(e),i=this.escapeRE(t),a=`(?:(?!${this.src_ZCc}|${r}|${i}).)`,o=`${r}${a}{0,1000}${i}`;for(let e=2;e<=n;e++)o=`${r}(?:${a}|${o}){0,1000}${i}`;return o}get_text_separators(){return this.cache.text_separators??=/[><\uff5c]/}get_pseudo_letter(){return this.cache.src_pseudo_letter??=RegExp(`(?:(?!${this.get_text_separators().source}|${this.src_ZPCc})${this.src_Any})`)}get_ipv4_addr(){return this.cache.src_ip4??=RegExp(`(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])[.]){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])`)}get_ipv6_addr(){let e=`[0-9A-Fa-f]{1,4}`,t=`(?:(?:${e}:${e})|${this.get_ipv4_addr().source})`;return this.cache.src_ip6_addr??=RegExp(`(?:(?:${e}:){6}${t}|::(?:${e}:){5}${t}|(?:${e})?::(?:${e}:){4}${t}|(?:(?:${e}:){0,1}${e})?::(?:${e}:){3}${t}|(?:(?:${e}:){0,2}${e})?::(?:${e}:){2}${t}|(?:(?:${e}:){0,3}${e})?::${e}:${t}|(?:(?:${e}:){0,4}${e})?::${t}|(?:(?:${e}:){0,5}${e})?::${e}|(?:(?:${e}:){0,6}${e})?::)`)}get_ipv6_url_host(){return this.cache.src_ip6_host??=RegExp(`\\[${this.get_ipv6_addr().source}\\]`)}get_ipv6_mail_host(){return this.cache.src_ipv6_mail_host??=RegExp(`\\[IPv6:${this.get_ipv6_addr().source}\\]`)}get_auth(){return this.cache.src_auth??=RegExp(`(?:(?:(?!${this.src_ZCc}|[@/\\[\\]()]).){1,50}@)?`)}get_port(){return this.cache.src_port??=RegExp(`(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?`)}get_host_terminator(){return this.cache.src_host_terminator??=RegExp(`(?=$|${this.get_text_separators().source}|${this.src_ZPCc})(?!${this.opts[`---`]?`-(?!--)|`:`-|`}_|:\\d|\\.-|\\.(?!$|${this.src_ZPCc}))`)}get_path_terminator(){return this.cache.src_path_terminator??=RegExp(`${this.src_ZPCc}|${this.get_text_separators().source}`)}get_path(){return this.cache.src_path??=RegExp(`(?:[/?#](?:${this.nestedPairRE(`[`,`]`)}|${this.nestedPairRE(`(`,`)`)}|${this.nestedPairRE(`{`,`}`)}|\\"(?:(?!${this.src_ZCc}|["]).){1,100}\\"|\\'(?:(?!${this.src_ZCc}|[']).){1,100}\\'|\\'(?=${this.get_pseudo_letter().source}|[-])|\\.{2,20}[:]?[a-zA-Z0-9%/&]|\\.(?!${this.src_ZCc}|[.]|$)|`+(this.opts[`---`]?`\\-(?!--(?:[^-]|$))(?:-{0,19})|`:`\\-{1,20}|`)+`,(?!${this.src_ZCc}|$)|;(?!${this.src_ZCc}|$)|\\!{1,20}(?!${this.src_ZCc}|[!]|$)|\\?(?!${this.src_ZCc}|[?]|$)|`+this.get_path_extra().source+`[\\\\/:%@#&=_~*]|(?!${this.get_path_terminator().source}).){1,${this.opts.maxLength}}|\\/)?`)}get_mail_name(){return this.cache.src_mail_name??=RegExp("[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9](?:[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9]|[.](?=[-!#$%&'*+/=?^_`{|}~a-zA-Z0-9])){0,63}")}get_xn(){return this.cache.src_xn??=RegExp(`xn--[a-z0-9\\-]{1,59}`)}get_tld(){if(this.cache.tld)return this.cache.tld;let e=[...new Set(this.opts.tlds||[])].sort().reverse().join(`|`);return this.cache.tld=RegExp(`${e||`$#none#$`}|${this.get_xn().source}`),this.cache.tld}get_domain_root(){return this.cache.src_domain_root??=RegExp(`(?:`+this.get_xn().source+`|${this.get_pseudo_letter().source}{1,63})`)}get_domain(){return this.cache.src_domain??=RegExp(`(?:`+this.get_xn().source+`|(?:${this.get_pseudo_letter().source})|(?:${this.get_pseudo_letter().source}(?:-|${this.get_pseudo_letter().source}){0,61}${this.get_pseudo_letter().source}))`)}get_url_host_port(){return this.cache.url_host_port??=RegExp(`(?:`+this.get_ipv6_url_host().source+`|(?:(?:(?:${this.get_domain().source})\\.){0,10}${this.get_domain().source}))`+this.get_port().source+this.get_host_terminator().source)}get_fuzzy_url_host_port(){return this.cache.fuzzy_url_host_port??=RegExp(`(?:`+(this.opts.fuzzyIP?this.get_ipv4_addr().source+`|`:``)+`(?:(?:(?:${this.get_domain().source})\\.){1,10}(?:${this.get_tld().source})))`+this.get_host_terminator().source)}get_mail_host(){return this.cache.src_mail_host??=RegExp(`(?:`+this.get_ipv6_mail_host().source+`|(?:(?:(?:${this.get_domain().source})\\.){0,4}${this.get_domain().source}))`+this.get_host_terminator().source)}get_fuzzy_mail_host(){return this.cache.src_fuzzy_mail_host??=RegExp(`(?:`+this.get_ipv6_mail_host().source+`|(?:(?:(?:${this.get_domain().source})[.]){1,4}${this.get_domain_root().source}))`+this.get_host_terminator().source)}get_path_extra(){return this.cache.src_path_extra??=RegExp(``)}get_fuzzy_mail_host_search(){return this.cache.mail_fuzzy_host_search??=RegExp(`@${this.get_fuzzy_mail_host().source}`,`ig`)}get_fuzzy_link_search(){return this.cache.link_fuzzy_search??=RegExp(`(^|(?![.:/\\-_@])(?:[$+<=>^\`|\uff5c]|${this.src_ZPCc}))(?:(?![$+<=>^\`|\uff5c])${this.get_fuzzy_url_host_port().source}${this.get_path().source})`,`ig`)}get_http_validator(){return this.cache.http_validator??=RegExp(`\\/\\/`+(this.opts.urlAuth?this.get_auth().source:``)+this.get_url_host_port().source+this.get_path().source,`iy`)}get_relative_proto_validator(){return this.cache.relative_proto_validator??=RegExp((this.opts.urlAuth?this.get_auth().source:``)+`(?:localhost|${this.get_ipv6_url_host().source}|(?:(?:${this.get_domain().source})[.]){1,10}${this.get_domain_root().source})`+this.get_port().source+this.get_host_terminator().source+this.get_path().source,`iy`)}get_mail_name_validator(){return this.cache.mail_name_validator??=RegExp(`(?:^|${this.get_text_separators().source}|"|\\(|${this.src_ZCc})(${this.get_mail_name().source})$`)}get_mailto_validator(){return this.cache.mailto_validator??=RegExp(`${this.get_mail_name().source}@${this.get_mail_host().source}`,`iy`)}get_schema_names(){return this.cache.schema_names??=new RegExp((this.opts.schema_names||[]).map(e=>this.escapeRE(e)).join(`|`))}get_schema_search(){return this.cache.schema_search??=RegExp(`(^|(?!_)(?:[><\uff5c]|${this.src_ZPCc}))(${this.get_schema_names().source})`,`ig`)}get_schema_at_start(){return this.cache.schema_at_start??=RegExp(`^${this.get_schema_search().source}`,`i`)}},Hi={validate:(e,t,n)=>{let r=n.re.get_http_validator();r.lastIndex=t;let i=r.exec(e);return i?i[0].length:0},normalize:(e,t)=>t.normalize(e)},Ui={"http:":Hi,"https:":Hi,"ftp:":Hi,"//":{validate:function(e,t,n){let r=n.re.get_relative_proto_validator();r.lastIndex=t;let i=r.exec(e);return i?t>=3&&e[t-3]===`:`||t>=3&&e[t-3]===`/`?0:i[0].length:0},normalize:(e,t)=>t.normalize(e)},"mailto:":{validate:function(e,t,n){let r=n.re.get_mailto_validator();r.lastIndex=t;let i=r.exec(e);return i?i[0].length:0},normalize:(e,t)=>t.normalize(e)}},Wi=`a:cdefgilmnoqrstuwxz|b:abdefghijmnorstvwyz|c:acdfghiklmnoruvwxyz|d:ejkmoz|e:cegrstu|f:ijkmor|g:abdefghilmnpqrstuwy|h:kmnrtu|i:delmnoqrst|j:emop|k:eghimnprwyz|l:abcikrstuvy|m:acdeghklmnopqrstuvwxyz|n:acefgilopruz|o:m|p:aefghklmnrstwy|q:a|r:eosuw|s:abcdeghijklmnortuvxyz|t:cdfghjklmnortvwz|u:agksyz|v:aceginu|w:fs|y:et|z:amw`,Gi=`biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф`;function Ki(){let e=Gi.split(`|`);return Wi.split(`|`).forEach(t=>{let n=t.indexOf(`:`),r=t.slice(0,n);for(let i of t.slice(n+1))e.push(r+i)}),e}var qi={fuzzyLink:!1,fuzzyEmail:!0,fuzzyIP:!1,"---":!1,tlds:Ki(),urlAuth:!1,maxLength:1e4},Ji=class{schema;index;lastIndex;raw;text;url;constructor(e,t,n,r){let i=e.slice(n,r);this.schema=t.toLowerCase(),this.index=n,this.lastIndex=r,this.raw=i,this.text=i,this.url=i}},Yi=class{__opts__;__schemas__;re;constructor(e={}){let{rebuilder:t,...n}=e;this.__opts__={...qi,...n},this.__schemas__={...Ui},this.re=t||new Vi,this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)})}add(e,t=null){if(!t)delete this.__schemas__[e];else{let n={normalize:(e,t)=>t.normalize(e),...t};this.__schemas__[e]=n}return this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}set(e={}){return this.__opts__={...this.__opts__,...e},this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}test(e){if(!e.length)return!1;let t,n;for(n=this.re.get_schema_search(),n.lastIndex=0;(t=n.exec(e))!==null;)if(this.testSchemaAt(e,t[2],n.lastIndex))return!0;if(this.__opts__.fuzzyLink&&this.__schemas__[`http:`]&&(n=this.re.get_fuzzy_link_search(),n.lastIndex=0,n.exec(e)!==null))return!0;if(this.__opts__.fuzzyEmail&&this.__schemas__[`mailto:`]&&e.indexOf(`@`)>=0){let n=this.re.get_fuzzy_mail_host_search(),r=this.re.get_mail_name_validator();for(n.lastIndex=0;(t=n.exec(e))!==null;){let n=e.slice(Math.max(0,t.index-65),t.index);if(r.test(n))return!0}}return!1}testSchemaAt(e,t,n){return this.__schemas__[t.toLowerCase()]?this.__schemas__[t.toLowerCase()].validate(e.slice(0,n+this.__opts__.maxLength),n,this):0}match(e){let t=[],n=this.re.get_schema_search(),r,i,a,o,s,c,l=!1,u=!1,d=!1,f=0;if(!e.length)return null;for(n.lastIndex=0,this.__opts__.fuzzyLink&&this.__schemas__[`http:`]&&(r=this.re.get_fuzzy_link_search(),r.lastIndex=0),this.__opts__.fuzzyEmail&&this.__schemas__[`mailto:`]&&(i=this.re.get_fuzzy_mail_host_search(),i.lastIndex=0,a=this.re.get_mail_name_validator());;){let p=Math.max(f-1,0);if(i&&a&&!d&&(!s||s.index<f))for(i.lastIndex<p&&(i.lastIndex=p);;){let t=i.exec(e);if(!t){d=!0,s=void 0;break}let n=a.exec(e.slice(Math.max(0,t.index-65),t.index));if(n){if(s={schema:`mailto:`,index:t.index-n[1].length,lastIndex:t.index+t[0].length},s.index>=f)break;i.lastIndex<p&&(i.lastIndex=p)}}if(r&&!u&&(!o||o.index<f))for(r.lastIndex<p&&(r.lastIndex=p);;){let t=r.exec(e);if(!t){u=!0,o=void 0;break}if(o={schema:``,index:t.index+t[1].length,lastIndex:t.index+t[0].length},o.index>=f)break;r.lastIndex<p&&(r.lastIndex=p)}let m=s;(!m||o&&(o.index<m.index||o.index===m.index&&o.lastIndex>m.lastIndex))&&(m=o);let h;if(!l)for(;;){if(!c){n.lastIndex<p&&(n.lastIndex=p);let t=n.exec(e);if(!t){l=!0;break}c={schema:t[2],index:t.index+t[1].length,lastIndex:t.index+t[0].length}}if(c.index<f){c=void 0;continue}if(m&&c.index>m.index)break;let t=c;c=void 0;let r=this.testSchemaAt(e,t.schema,t.lastIndex);if(r){h={schema:t.schema,index:t.index,lastIndex:t.lastIndex+r};break}}let g=h;if((!g||s&&(s.index<g.index||s.index===g.index&&s.lastIndex>g.lastIndex))&&(g=s),(!g||o&&(o.index<g.index||o.index===g.index&&o.lastIndex>g.lastIndex))&&(g=o),!g)break;g===s?s=void 0:g===o&&(o=void 0);let _=new Ji(e,g.schema,g.index,g.lastIndex);_.schema?this.__schemas__[_.schema].normalize(_,this):this.normalize(_),t.push(_),f=g.lastIndex}return t.length?t:null}matchAtStart(e){if(!e.length)return null;let t=this.re.get_schema_at_start().exec(e);if(!t)return null;let n=this.testSchemaAt(e,t[2],t[0].length);if(!n)return null;let r=new Ji(e,t[2],t.index+t[1].length,t.index+t[0].length+n);return this.__schemas__[r.schema].normalize(r,this),r}tlds(e,t=!1){return e=Array.isArray(e)?e:[e],t?this.__opts__.tlds=this.__opts__.tlds.concat(e):this.__opts__.tlds=e,this.re.set({...this.__opts__,schema_names:Object.keys(this.__schemas__)}),this}normalize(e){e.schema||(e.url=`http://${e.url}`),e.schema===`mailto:`&&!/^mailto:/i.test(e.url)&&(e.url=`mailto:${e.url}`)}},L=2147483647,R=36,Xi=1,Zi=26,Qi=38,$i=700,ea=72,ta=128,na=`-`,ra=/^xn--/,ia=/[^\0-\x7F]/,aa=/[\x2E\u3002\uFF0E\uFF61]/g,oa={overflow:`Overflow: input needs wider integers to process`,"not-basic":`Illegal input >= 0x80 (not a basic code point)`,"invalid-input":`Invalid input`},sa=R-Xi,z=Math.floor,ca=String.fromCharCode;function B(e){throw RangeError(oa[e])}function la(e,t){let n=[],r=e.length;for(;r--;)n[r]=t(e[r]);return n}function ua(e,t){let n=e.split(`@`),r=``;n.length>1&&(r=n[0]+`@`,e=n[1]),e=e.replace(aa,`.`);let i=la(e.split(`.`),t).join(`.`);return r+i}function da(e){let t=[],n=0,r=e.length;for(;n<r;){let i=e.charCodeAt(n++);if(i>=55296&&i<=56319&&n<r){let r=e.charCodeAt(n++);(r&64512)==56320?t.push(((i&1023)<<10)+(r&1023)+65536):(t.push(i),n--)}else t.push(i)}return t}var fa=e=>String.fromCodePoint(...e),pa=function(e){return e>=48&&e<58?26+(e-48):e>=65&&e<91?e-65:e>=97&&e<123?e-97:R},ma=function(e,t){return e+22+75*(e<26)-((t!=0)<<5)},ha=function(e,t,n){let r=0;for(e=n?z(e/$i):e>>1,e+=z(e/t);e>455;r+=R)e=z(e/sa);return z(r+36*e/(e+Qi))},ga=function(e){let t=[],n=e.length,r=0,i=ta,a=ea,o=e.lastIndexOf(na);o<0&&(o=0);for(let n=0;n<o;++n)e.charCodeAt(n)>=128&&B(`not-basic`),t.push(e.charCodeAt(n));for(let s=o>0?o+1:0;s<n;){let o=r;for(let t=1,i=R;;i+=R){s>=n&&B(`invalid-input`);let o=pa(e.charCodeAt(s++));o>=R&&B(`invalid-input`),o>z((L-r)/t)&&B(`overflow`),r+=o*t;let c=i<=a?Xi:i>=a+Zi?Zi:i-a;if(o<c)break;let l=R-c;t>z(L/l)&&B(`overflow`),t*=l}let c=t.length+1;a=ha(r-o,c,o==0),z(r/c)>L-i&&B(`overflow`),i+=z(r/c),r%=c,t.splice(r++,0,i)}return String.fromCodePoint(...t)},_a=function(e){let t=[];e=da(e);let n=e.length,r=ta,i=0,a=ea;for(let n of e)n<128&&t.push(ca(n));let o=t.length,s=o;for(o&&t.push(na);s<n;){let n=L;for(let t of e)t>=r&&t<n&&(n=t);let c=s+1;n-r>z((L-i)/c)&&B(`overflow`),i+=(n-r)*c,r=n;for(let n of e)if(n<r&&++i>L&&B(`overflow`),n===r){let e=i;for(let n=R;;n+=R){let r=n<=a?Xi:n>=a+Zi?Zi:n-a;if(e<r)break;let i=e-r,o=R-r;t.push(ca(ma(r+i%o,0))),e=z(i/o)}t.push(ca(ma(e,0))),a=ha(i,c,s===o),i=0,++s}++i,++r}return t.join(``)},va={version:`2.3.1`,ucs2:{decode:da,encode:fa},decode:ga,encode:_a,toASCII:function(e){return ua(e,function(e){return ia.test(e)?`xn--`+_a(e):e})},toUnicode:function(e){return ua(e,function(e){return ra.test(e)?ga(e.slice(4).toLowerCase()):e})}},ya=Object.defineProperty,ba=(e,t)=>{let n={};for(var r in e)ya(n,r,{get:e[r],enumerable:!0});return t||ya(n,Symbol.toStringTag,{value:`Module`}),n},xa=ba({arrayReplaceAt:()=>Ca,asciiTrim:()=>Ha,callable:()=>Sa,escapeHtml:()=>U,escapeRE:()=>Fa,fromCodePoint:()=>V,isMdAsciiPunct:()=>za,isPunctChar:()=>La,isPunctCharCode:()=>Ra,isSpace:()=>W,isValidEntityCode:()=>wa,isWhiteSpace:()=>Ia,lib:()=>Ua,normalizeReference:()=>Ba,unescapeAll:()=>H,unescapeMd:()=>ka});function Sa(e){let t=function(...n){return Reflect.construct(e,n,new.target&&new.target!==t?new.target:e)};return Object.defineProperty(t,"name",{value:e.name}),Object.setPrototypeOf(t,e),t.prototype=e.prototype,t}function Ca(e,t,n){return[].concat(e.slice(0,t),n,e.slice(t+1))}function wa(e){return!(e>=55296&&e<=57343||e>=64976&&e<=65007||(e&65535)==65535||(e&65535)==65534||e>=0&&e<=8||e===11||e>=14&&e<=31||e>=127&&e<=159||e>1114111)}function V(e){if(e>65535){e-=65536;let t=55296+(e>>10),n=56320+(e&1023);return String.fromCharCode(t,n)}return String.fromCharCode(e)}var Ta=/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g,Ea=RegExp(`${Ta.source}|&([a-z#][a-z0-9]{1,31});`,`gi`),Da=/^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;function Oa(e,t){if(t.charCodeAt(0)===35&&Da.test(t)){let n=t[1].toLowerCase()===`x`?parseInt(t.slice(2),16):parseInt(t.slice(1),10);return wa(n)?V(n):e}let n=Bi(e);return n===e?e:n}function ka(e){return e.indexOf(`\\`)<0?e:e.replace(Ta,`$1`)}function H(e){return e.indexOf(`\\`)<0&&e.indexOf(`&`)<0?e:e.replace(Ea,function(e,t,n){return t||Oa(e,n)})}var Aa=/[&<>"]/,ja=/[&<>"]/g,Ma={"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`};function Na(e){return Ma[e]}function U(e){return Aa.test(e)?e.replace(ja,Na):e}var Pa=/[.?*+^$[\]\\(){}|-]/g;function Fa(e){return e.replace(Pa,`\\$&`)}function W(e){switch(e){case 9:case 32:return!0}return!1}function Ia(e){if(e>=8192&&e<=8202)return!0;switch(e){case 9:case 10:case 11:case 12:case 13:case 32:case 160:case 5760:case 8239:case 8287:case 12288:return!0}return!1}function La(e){return hi.test(e)||gi.test(e)}function Ra(e){return La(V(e))}function za(e){switch(e){case 33:case 34:case 35:case 36:case 37:case 38:case 39:case 40:case 41:case 42:case 43:case 44:case 45:case 46:case 47:case 58:case 59:case 60:case 61:case 62:case 63:case 64:case 91:case 92:case 93:case 94:case 95:case 96:case 123:case 124:case 125:case 126:return!0;default:return!1}}function Ba(e){return e=e.trim().replace(/\s+/g,` `),e.toLowerCase().toUpperCase()}function Va(e){return e===32||e===9||e===10||e===13}function Ha(e){let t=0;for(;t<e.length&&Va(e.charCodeAt(t));t++);let n=e.length-1;for(;n>=t&&Va(e.charCodeAt(n));n--);return e.slice(t,n+1)}var Ua={mdurl:ui,ucmicro:di};function Wa(e,t,n){let r,i,a,o,s=e.posMax,c=e.pos;for(e.pos=t+1,r=1;e.pos<s;){if(a=e.src.charCodeAt(e.pos),a===93&&(r--,r===0)){i=!0;break}if(o=e.pos,e.md.inline.skipToken(e),a===91){if(o===e.pos-1)r++;else if(n)return e.pos=c,-1}}let l=-1;return i&&(l=e.pos),e.pos=c,l}function Ga(e,t,n){let r,i=t,a={ok:!1,pos:0,str:``};if(e.charCodeAt(i)===60){for(i++;i<n;){if(r=e.charCodeAt(i),r===10||r===60)return a;if(r===62)return a.pos=i+1,a.str=H(e.slice(t+1,i)),a.ok=!0,a;if(r===92&&i+1<n){i+=2;continue}i++}return a}let o=0;for(;i<n&&(r=e.charCodeAt(i),!(r===32||r<32||r===127));){if(r===92&&i+1<n){if(e.charCodeAt(i+1)===32){i++;continue}i+=2;continue}if(r===40&&(o++,o>32))return a;if(r===41){if(o===0)break;o--}i++}return t===i||o!==0?a:(a.str=H(e.slice(t,i)),a.pos=i,a.ok=!0,a)}function Ka(e,t,n,r){let i,a=t,o={ok:!1,can_continue:!1,pos:0,str:``,marker:0};if(r)o.str=r.str,o.marker=r.marker;else{if(a>=n)return o;let r=e.charCodeAt(a);if(r!==34&&r!==39&&r!==40)return o;t++,a++,r===40&&(r=41),o.marker=r}for(;a<n;){if(i=e.charCodeAt(a),i===o.marker)return o.pos=a+1,o.str+=H(e.slice(t,a)),o.ok=!0,o;if(i===40&&o.marker===41)return o;i===92&&a+1<n&&a++,a++}return o.can_continue=!0,o.str+=H(e.slice(t,a)),o}var qa=ba({parseLinkDestination:()=>Ga,parseLinkLabel:()=>Wa,parseLinkTitle:()=>Ka});function Ja(e){"@babel/helpers - typeof";return Ja=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},Ja(e)}function Ya(e,t){if(Ja(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(Ja(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function Xa(e){var t=Ya(e,`string`);return Ja(t)==`symbol`?t:t+``}function G(e,t,n){return(t=Xa(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}var K=class{constructor(e,t,n){G(this,`map`,null),G(this,`level`,0),G(this,`children`,null),G(this,`content`,``),G(this,`markup`,``),G(this,`info`,``),G(this,`block`,!1),G(this,`hidden`,!1),this.type=e,this.tag=t,this.attrs=null,this.nesting=n,this.meta=null}attrIndex(e){if(!this.attrs)return-1;let t=this.attrs;for(let n=0,r=t.length;n<r;n++)if(t[n][0]===e)return n;return-1}attrPush(e){this.attrs?this.attrs.push(e):this.attrs=[e]}attrSet(e,t){let n=this.attrIndex(e),r=[e,t];n<0?this.attrPush(r):this.attrs[n]=r}attrGet(e){let t=this.attrIndex(e),n=null;return t>=0&&(n=this.attrs[t][1]),n}attrJoin(e,t){let n=this.attrIndex(e);n<0?this.attrPush([e,t]):this.attrs[n][1]=`${this.attrs[n][1]} ${t}`}},Za=class{constructor(){G(this,`__rules__`,[]),G(this,`__cache__`,null)}__find__(e){for(let t=0;t<this.__rules__.length;t++)if(this.__rules__[t].name===e)return t;return-1}__compile__(){let e=new Set;this.__rules__.forEach(t=>{t.enabled&&t.alt.forEach(t=>{t&&e.add(t)})}),this.__cache__=Object.create(null),this.__cache__[``]=[],this.__rules__.forEach(e=>{e.enabled&&this.__cache__[``].push(e.fn)}),e.forEach(e=>{this.__cache__[e]=[],this.__rules__.forEach(t=>{t.enabled&&t.alt.indexOf(e)>=0&&this.__cache__[e].push(t.fn)})})}at(e,t,n={}){let r=this.__find__(e);if(r===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__[r].fn=t,this.__rules__[r].alt=n.alt||[],this.__cache__=null}before(e,t,n,r={}){let i=this.__find__(e);if(i===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__.splice(i,0,{name:t,enabled:!0,fn:n,alt:r.alt||[]}),this.__cache__=null}after(e,t,n,r={}){let i=this.__find__(e);if(i===-1)throw Error(`Parser rule not found: ${e}`);this.__rules__.splice(i+1,0,{name:t,enabled:!0,fn:n,alt:r.alt||[]}),this.__cache__=null}push(e,t,n={}){this.__rules__.push({name:e,enabled:!0,fn:t,alt:n.alt||[]}),this.__cache__=null}enable(e,t=!1){Array.isArray(e)||(e=[e]);let n=[];return e.forEach(e=>{let r=this.__find__(e);if(r<0){if(t)return;throw Error(`Rules manager: invalid rule name ${e}`)}this.__rules__[r].enabled=!0,n.push(e)}),this.__cache__=null,n}enableOnly(e,t=!1){Array.isArray(e)||(e=[e]),this.__rules__.forEach(e=>{e.enabled=!1}),this.enable(e,t)}disable(e,t=!1){Array.isArray(e)||(e=[e]);let n=[];return e.forEach(e=>{let r=this.__find__(e);if(r<0){if(t)return;throw Error(`Rules manager: invalid rule name ${e}`)}this.__rules__[r].enabled=!1,n.push(e)}),this.__cache__=null,n}getRules(e){return this.__cache__||this.__compile__(),this.__cache__[e]||[]}},q={};q.code_inline=function(e,t,n,r,i){let a=e[t];return`<code${i.renderAttrs(a)}>${U(a.content)}</code>`},q.code_block=function(e,t,n,r,i){let a=e[t];return`<pre${i.renderAttrs(a)}><code>${U(e[t].content)}</code></pre>\n`},q.fence=function(e,t,n,r,i){let a=e[t],o=a.info?H(a.info).trim():``,s=``,c=``;if(o){let e=o.split(/(\s+)/g);s=e[0],c=e.slice(2).join(``)}let l;if(l=n.highlight&&n.highlight(a.content,s,c)||U(a.content),l.indexOf(`<pre`)===0)return l+`
`;if(o){let e=a.attrIndex(`class`),t=a.attrs?a.attrs.slice():[];e<0?t.push([`class`,`${n.langPrefix}${s}`]):(t[e]=[t[e][0],t[e][1]],t[e][1]+=` ${n.langPrefix}${s}`);let r={attrs:t};return`<pre><code${i.renderAttrs(r)}>${l}</code></pre>\n`}return`<pre><code${i.renderAttrs(a)}>${l}</code></pre>\n`},q.image=function(e,t,n,r,i){let a=e[t];return a.attrs[a.attrIndex(`alt`)][1]=i.renderInlineAsText(a.children,n,r),i.renderToken(e,t,n)},q.hardbreak=function(e,t,n){return n.xhtmlOut?`<br />
`:`<br>
`},q.softbreak=function(e,t,n){return n.breaks?n.xhtmlOut?`<br />
`:`<br>
`:`
`},q.text=function(e,t){return U(e[t].content)},q.html_block=function(e,t){return e[t].content},q.html_inline=function(e,t){return e[t].content};var Qa=class{constructor(){G(this,`rules`,Object.assign({},q))}renderAttrs(e){let t,n,r;if(!e.attrs)return``;for(r=``,t=0,n=e.attrs.length;t<n;t++)r+=` ${U(e.attrs[t][0])}="${U(String(e.attrs[t][1]))}"`;return r}renderToken(e,t,n){let r=e[t],i=``;if(r.hidden)return``;let a=t-1;for(;a>=0&&e[a].hidden&&e[a].nesting===0;)a--;r.block&&r.nesting!==-1&&a>=0&&e[a].hidden&&e[a].nesting===-1&&(i+=`
`),i+=(r.nesting===-1?`</`:`<`)+r.tag,i+=this.renderAttrs(r),r.nesting===0&&n.xhtmlOut&&(i+=` /`);let o=!1;if(r.block&&(o=!0,r.nesting===1)){let n=t+1;for(;n<e.length&&e[n].hidden&&e[n].nesting===0;)n++;if(n<e.length){let t=e[n];(t.type===`inline`||t.hidden||t.nesting===-1&&t.tag===r.tag)&&(o=!1)}}return i+=o?`>
`:`>`,i}renderInline(e,t,n){let r=``,i=this.rules;for(let a=0,o=e.length;a<o;a++){let o=e[a].type;i[o]===void 0?r+=this.renderToken(e,a,t):r+=i[o](e,a,t,n,this)}return r}renderInlineAsText(e,t,n){let r=``;for(let i=0,a=e.length;i<a;i++)switch(e[i].type){case`text`:case`code_inline`:r+=e[i].content;break;case`image`:r+=this.renderInlineAsText(e[i].children,t,n);break;case`html_inline`:case`html_block`:r+=e[i].content;break;case`softbreak`:case`hardbreak`:r+=`
`}return r}render(e,t,n){let r=``,i=this.rules;for(let a=0,o=e.length;a<o;a++){let o=e[a].type;o===`inline`?r+=this.renderInline(e[a].children,t,n):i[o]===void 0?r+=this.renderToken(e,a,t):r+=i[o](e,a,t,n,this)}return r}},$a=class{constructor(e,t,n){G(this,`tokens`,[]),G(this,`inlineMode`,!1),G(this,`Token`,K),this.src=e,this.env=n,this.md=t}},eo=/\r\n?/g,to=/\0/g;function no(e){let t;t=e.src.replace(eo,`
`),t=t.replace(to,`�`),e.src=t}function ro(e){let t;e.inlineMode?(t=new e.Token(`inline`,``,0),t.content=e.src,t.map=[0,1],t.children=[],e.tokens.push(t)):e.md.block.parse(e.src,e.md,e.env,e.tokens)}function io(e){let t=e.tokens,n=0;for(let e=0;e<t.length;e++)t[e].type!==`reference_definition`&&(e!==n&&(t[n]=t[e]),n++);t.length!==n&&(t.length=n)}function ao(e){let t=e.tokens;for(let n=0,r=t.length;n<r;n++){let r=t[n];r.type===`inline`&&e.md.inline.parse(r.content,e.md,e.env,r.children)}}function oo(e){return/^<a[>\s]/i.test(e)}function so(e){return/^<\/a\s*>/i.test(e)}function co(e){let t=e.tokens;if(e.md.options.linkify)for(let n=0,r=t.length;n<r;n++){if(t[n].type!==`inline`||!e.md.linkify.test(t[n].content))continue;let r=t[n].children,i=[],a=0;for(let t=r.length-1;t>=0;t--){let n=r[t];if(n.type===`link_close`){for(t--;r[t].level!==n.level&&r[t].type!==`link_open`;)t--;continue}if(n.type===`html_inline`&&(oo(n.content)&&a>0&&a--,so(n.content)&&a++),!(a>0)&&n.type===`text`&&e.md.linkify.test(n.content)){let a=n.content,o=e.md.linkify.match(a),s=[],c=n.level,l=0;o.length>0&&o[0].index===0&&t>0&&r[t-1].type===`text_special`&&(o=o.slice(1));for(let t=0;t<o.length;t++){let n=o[t].url,r=e.md.normalizeLink(n);if(!e.md.validateLink(r))continue;let i=o[t].text;i=o[t].schema?o[t].schema===`mailto:`&&!/^mailto:/i.test(i)?e.md.normalizeLinkText(`mailto:${i}`).replace(/^mailto:/,``):e.md.normalizeLinkText(i):e.md.normalizeLinkText(`http://${i}`).replace(/^http:\/\//,``);let u=o[t].index;if(u>l){let t=new e.Token(`text`,``,0);t.content=a.slice(l,u),t.level=c,s.push(t)}let d=new e.Token(`link_open`,`a`,1);d.attrs=[[`href`,r]],d.level=c++,d.markup=`linkify`,d.info=`auto`,s.push(d);let f=new e.Token(`text`,``,0);f.content=i,f.level=c,s.push(f);let p=new e.Token(`link_close`,`a`,-1);p.level=--c,p.markup=`linkify`,p.info=`auto`,s.push(p),l=o[t].lastIndex}if(l<a.length){let t=new e.Token(`text`,``,0);t.content=a.slice(l),t.level=c,s.push(t)}i.push({index:t,nodes:s})}}if(i.length>0){let e=r.length;for(let t of i)e+=t.nodes.length-1;let a=Array(e),o=0,s=0;i.reverse();for(let e=0;e<r.length;e++){let t=i[o];if(t?.index===e){for(let e of t.nodes)a[s++]=e;o++}else a[s++]=r[e]}t[n].children=a}}}var lo=/\+-|\.\.|\?\?\?\?|!!!!|,,|--/,uo=/\((c|tm|r)\)/i,fo=/\((c|tm|r)\)/gi,po={c:`©`,r:`®`,tm:`™`};function mo(e,t){return po[t.toLowerCase()]}function ho(e){let t=0;for(let n=e.length-1;n>=0;n--){let r=e[n];r.type===`text`&&!t&&(r.content=r.content.replace(fo,mo)),r.type===`link_open`&&r.info===`auto`&&t--,r.type===`link_close`&&r.info===`auto`&&t++}}function go(e){let t=0;for(let n=e.length-1;n>=0;n--){let r=e[n];r.type===`text`&&!t&&lo.test(r.content)&&(r.content=r.content.replace(/\+-/g,`±`).replace(/\.{2,}/g,`…`).replace(/([?!])…/g,`$1..`).replace(/([?!]){4,}/g,`$1$1$1`).replace(/,{2,}/g,`,`).replace(/(^|[^-])---(?=[^-]|$)/gm,`$1—`).replace(/(^|\s)--(?=\s|$)/gm,`$1–`).replace(/(^|[^-\s])--(?=[^-\s]|$)/gm,`$1–`)),r.type===`link_open`&&r.info===`auto`&&t--,r.type===`link_close`&&r.info===`auto`&&t++}}function _o(e){let t;if(e.md.options.typographer)for(t=e.tokens.length-1;t>=0;t--)e.tokens[t].type===`inline`&&(uo.test(e.tokens[t].content)&&ho(e.tokens[t].children),lo.test(e.tokens[t].content)&&go(e.tokens[t].children))}var vo=/['"]/,yo=/['"]/g,bo=`’`,xo=1e3;function So(e,t,n){for(;e.length>n;){let n=e.pop();n.isSingleQuote?t.single=n.prevSameQuoteIdx:t.double=n.prevSameQuoteIdx}}function Co(e,t,n,r){e[t]||(e[t]=[]),e[t].push({pos:n,ch:r})}function wo(e,t){let n=``,r=0;t.sort((e,t)=>e.pos-t.pos);for(let i=0;i<t.length;i++){let a=t[i];n+=e.slice(r,a.pos)+a.ch,r=a.pos+1}return n+e.slice(r)}function To(e,t){let n,r=[],i={single:-1,double:-1},a={};for(let o=0;o<e.length;o++){let s=e[o],c=e[o].level;for(n=r.length-1;n>=0&&!(r[n].level<=c);n--);if(So(r,i,n+1),s.type!==`text`)continue;let l=s.content,u=0,d=l.length;OUTER:for(;u<d;){yo.lastIndex=u;let s=yo.exec(l);if(!s)break;let f=!0,p=!0;u=s.index+1;let m=s[0]===`'`,h=32;if(s.index-1>=0)h=l.charCodeAt(s.index-1);else for(n=o-1;n>=0&&!(e[n].type===`softbreak`||e[n].type===`hardbreak`);n--)if(e[n].content){h=e[n].content.charCodeAt(e[n].content.length-1);break}let g=32;if(u<d)g=l.charCodeAt(u);else for(n=o+1;n<e.length&&!(e[n].type===`softbreak`||e[n].type===`hardbreak`);n++)if(e[n].content){g=e[n].content.charCodeAt(0);break}let _=za(h)||Ra(h),v=za(g)||Ra(g),y=Ia(h),b=Ia(g);if(b?f=!1:v&&(y||_||(f=!1)),y?p=!1:_&&(b||v||(p=!1)),g===34&&s[0]===`"`&&h>=48&&h<=57&&(p=f=!1),f&&p&&(f=_,p=v),!f&&!p){m&&Co(a,o,s.index,bo);continue}if(p&&(n=m?i.single:i.double,n>=0&&r[n].level===c)){let e=r[n],c,l;m?(c=t.md.options.quotes[2],l=t.md.options.quotes[3]):(c=t.md.options.quotes[0],l=t.md.options.quotes[1]),Co(a,o,s.index,l),Co(a,e.tokenIdx,e.contentPos,c),So(r,i,n);continue OUTER}if(f){if(r.length>=xo)return;r.push({tokenIdx:o,contentPos:s.index,isSingleQuote:m,level:c,prevSameQuoteIdx:m?i.single:i.double}),m?i.single=r.length-1:i.double=r.length-1}else p&&m&&Co(a,o,s.index,bo)}}Object.keys(a).forEach(function(t){let n=Number(t);e[n].content=wo(e[n].content,a[t])})}function Eo(e){if(e.md.options.typographer)for(let t=e.tokens.length-1;t>=0;t--)e.tokens[t].type!==`inline`||!vo.test(e.tokens[t].content)||To(e.tokens[t].children,e)}function Do(e){let t,n,r=e.length;for(t=0;t<r;t++)e[t].type===`text_special`&&(e[t].type=`text`);for(t=n=0;t<r;t++)e[t].type===`text`&&t+1<r&&e[t+1].type===`text`?e[t+1].content=e[t].content+e[t+1].content:(t!==n&&(e[n]=e[t]),n++);t!==n&&(e.length=n)}function Oo(e){let t,n,r=e.tokens,i=r.length;for(let e=0;e<i;e++){if(r[e].type!==`inline`)continue;let i=r[e].children,a=i.length;for(t=0;t<a;t++)i[t].type===`text_special`&&(i[t].type=`text`),i[t].children&&Do(i[t].children);for(t=n=0;t<a;t++)i[t].type===`text`&&t+1<a&&i[t+1].type===`text`?i[t+1].content=i[t].content+i[t+1].content:(t!==n&&(i[n]=i[t]),n++);t!==n&&(i.length=n)}}var ko=[[`normalize`,no],[`block`,ro],[`strip_references`,io],[`inline`,ao],[`linkify`,co],[`replacements`,_o],[`smartquotes`,Eo],[`text_join`,Oo]],Ao=class{constructor(){G(this,`ruler`,new Za),G(this,`State`,$a);for(let e=0;e<ko.length;e++)this.ruler.push(ko[e][0],ko[e][1])}process(e){let t=this.ruler.getRules(``);for(let n=0,r=t.length;n<r;n++)t[n](e)}},jo=class{constructor(e,t,n,r){G(this,`bMarks`,[]),G(this,`eMarks`,[]),G(this,`tShift`,[]),G(this,`sCount`,[]),G(this,`bsCount`,[]),G(this,`blkIndent`,0),G(this,`line`,0),G(this,`lineMax`,0),G(this,`tight`,!1),G(this,`listIndent`,-1),G(this,`parentType`,`root`),G(this,`level`,0),G(this,`Token`,K),this.src=e,this.md=t,this.env=n,this.tokens=r;let i=this.src;for(let e=0,t=0,n=0,r=0,a=i.length,o=!1;t<a;t++){let s=i.charCodeAt(t);if(!o)if(W(s)){n++,s===9?r+=4-r%4:r++;continue}else o=!0;(s===10||t===a-1)&&(s!==10&&t++,this.bMarks.push(e),this.eMarks.push(t),this.tShift.push(n),this.sCount.push(r),this.bsCount.push(0),o=!1,n=0,r=0,e=t+1)}this.bMarks.push(i.length),this.eMarks.push(i.length),this.tShift.push(0),this.sCount.push(0),this.bsCount.push(0),this.lineMax=this.bMarks.length-1}push(e,t,n){let r=new K(e,t,n);return r.block=!0,n<0&&this.level--,r.level=this.level,n>0&&this.level++,this.tokens.push(r),r}isEmpty(e){return this.bMarks[e]+this.tShift[e]>=this.eMarks[e]}skipEmptyLines(e){for(let t=this.lineMax;e<t&&!(this.bMarks[e]+this.tShift[e]<this.eMarks[e]);e++);return e}skipSpaces(e){for(let t=this.src.length;e<t&&W(this.src.charCodeAt(e));e++);return e}skipSpacesBack(e,t){if(e<=t)return e;for(;e>t;)if(!W(this.src.charCodeAt(--e)))return e+1;return e}skipChars(e,t){for(let n=this.src.length;e<n&&this.src.charCodeAt(e)===t;e++);return e}skipCharsBack(e,t,n){if(e<=n)return e;for(;e>n;)if(t!==this.src.charCodeAt(--e))return e+1;return e}getLines(e,t,n,r){if(e>=t)return``;let i=Array(t-e);for(let a=0,o=e;o<t;o++,a++){let e=0,s=this.bMarks[o],c=s,l;for(l=o+1<t||r?this.eMarks[o]+1:this.eMarks[o];c<l&&e<n;){let t=this.src.charCodeAt(c);if(W(t))t===9?e+=4-(e+this.bsCount[o])%4:e++;else if(c-s<this.tShift[o])e++;else break;c++}e>n?i[a]=Array(e-n+1).join(` `)+this.src.slice(c,l):i[a]=this.src.slice(c,l)}return i.join(``)}},Mo=65536;function No(e,t){let n=e.bMarks[t]+e.tShift[t],r=e.eMarks[t];return e.src.slice(n,r)}function Po(e){let t=[],n=e.length,r=0,i=e.charCodeAt(r),a=!1,o=0,s=``;for(;r<n;)i===124&&(a?(s+=e.substring(o,r-1),o=r):(t.push(s+e.substring(o,r)),s=``,o=r+1)),a=i===92,r++,i=e.charCodeAt(r);return t.push(s+e.substring(o)),t}function Fo(e,t,n,r){if(t+2>n)return!1;let i=t+1;if(e.sCount[i]<e.blkIndent||e.sCount[i]-e.blkIndent>=4)return!1;let a=e.bMarks[i]+e.tShift[i];if(a>=e.eMarks[i])return!1;let o=e.src.charCodeAt(a++);if(o!==124&&o!==45&&o!==58||a>=e.eMarks[i])return!1;let s=e.src.charCodeAt(a++);if(s!==124&&s!==45&&s!==58&&!W(s)||o===45&&W(s))return!1;for(;a<e.eMarks[i];){let t=e.src.charCodeAt(a);if(t!==124&&t!==45&&t!==58&&!W(t))return!1;a++}let c=No(e,t+1),l=c.split(`|`),u=[];for(let e=0;e<l.length;e++){let t=l[e].trim();if(!t){if(e===0||e===l.length-1)continue;return!1}if(!/^:?-+:?$/.test(t))return!1;t.charCodeAt(t.length-1)===58?u.push(t.charCodeAt(0)===58?`center`:`right`):t.charCodeAt(0)===58?u.push(`left`):u.push(``)}if(c=No(e,t).trim(),c.indexOf(`|`)===-1||e.sCount[t]-e.blkIndent>=4)return!1;l=Po(c),l.length&&l[0]===``&&l.shift(),l.length&&l[l.length-1]===``&&l.pop();let d=l.length;if(d===0||d!==u.length)return!1;if(r)return!0;let f=e.parentType;e.parentType=`table`;let p=e.md.block.ruler.getRules(`blockquote`),m=e.push(`table_open`,`table`,1),h=[t,0];m.map=h;let g=e.push(`thead_open`,`thead`,1);g.map=[t,t+1];let _=e.push(`tr_open`,`tr`,1);_.map=[t,t+1];for(let t=0;t<l.length;t++){let n=e.push(`th_open`,`th`,1);u[t]&&(n.attrs=[[`style`,`text-align:${u[t]}`]]);let r=e.push(`inline`,``,0);r.content=l[t].trim(),r.children=[],e.push(`th_close`,`th`,-1)}e.push(`tr_close`,`tr`,-1),e.push(`thead_close`,`thead`,-1);let v,y=0;for(i=t+2;i<n&&!(e.sCount[i]<e.blkIndent);i++){let r=!1;for(let t=0,a=p.length;t<a;t++)if(p[t](e,i,n,!0)){r=!0;break}if(r||(c=No(e,i).trim(),!c)||e.sCount[i]-e.blkIndent>=4||(l=Po(c),l.length&&l[0]===``&&l.shift(),l.length&&l[l.length-1]===``&&l.pop(),y+=d-l.length,y>Mo))break;if(i===t+2){let n=e.push(`tbody_open`,`tbody`,1);n.map=v=[t+2,0]}let a=e.push(`tr_open`,`tr`,1);a.map=[i,i+1];for(let t=0;t<d;t++){let n=e.push(`td_open`,`td`,1);u[t]&&(n.attrs=[[`style`,`text-align:${u[t]}`]]);let r=e.push(`inline`,``,0);r.content=l[t]?l[t].trim():``,r.children=[],e.push(`td_close`,`td`,-1)}e.push(`tr_close`,`tr`,-1)}return v&&(e.push(`tbody_close`,`tbody`,-1),v[1]=i),e.push(`table_close`,`table`,-1),h[1]=i,e.parentType=f,e.line=i,!0}function Io(e,t,n){if(e.sCount[t]-e.blkIndent<4)return!1;let r=t+1,i=r;for(;r<n;){if(e.isEmpty(r)){r++;continue}if(e.sCount[r]-e.blkIndent>=4){r++,i=r;continue}break}e.line=i;let a=e.push(`code_block`,`code`,0);return a.content=e.getLines(t,i,4+e.blkIndent,!1)+`
`,a.map=[t,e.line],!0}function Lo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4||i+3>a)return!1;let o=e.src.charCodeAt(i);if(o!==126&&o!==96)return!1;let s=i;i=e.skipChars(i,o);let c=i-s;if(c<3)return!1;let l=e.src.slice(s,i),u=e.src.slice(i,a);if(o===96&&u.indexOf(String.fromCharCode(o))>=0)return!1;if(r)return!0;let d=t,f=!1;for(;d++,!(d>=n||(i=s=e.bMarks[d]+e.tShift[d],a=e.eMarks[d],i<a&&e.sCount[d]<e.blkIndent));)if(e.src.charCodeAt(i)===o&&!(e.sCount[d]-e.blkIndent>=4)&&(i=e.skipChars(i,o),!(i-s<c)&&(i=e.skipSpaces(i),!(i<a)))){f=!0;break}c=e.sCount[t],e.line=d+ +!!f;let p=e.push(`fence`,`code`,0);return p.info=u,p.content=e.getLines(t+1,d,c,!0),p.markup=l,p.map=[t,e.line],!0}function Ro(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t],o=e.lineMax;if(e.sCount[t]-e.blkIndent>=4||e.src.charCodeAt(i)!==62)return!1;if(r)return!0;let s=[],c=[],l=[],u=[],d=e.md.block.ruler.getRules(`blockquote`),f=e.parentType;e.parentType=`blockquote`;let p=!1,m;for(m=t;m<n;m++){let t=e.sCount[m]<e.blkIndent;if(i=e.bMarks[m]+e.tShift[m],a=e.eMarks[m],i>=a)break;if(e.src.charCodeAt(i++)===62&&!t){let t=e.sCount[m]+1,n,r;e.src.charCodeAt(i)===32?(i++,t++,r=!1,n=!0):e.src.charCodeAt(i)===9?(n=!0,(e.bsCount[m]+t)%4==3?(i++,t++,r=!1):r=!0):n=!1;let o=t;for(s.push(e.bMarks[m]),e.bMarks[m]=i;i<a;){let t=e.src.charCodeAt(i);if(W(t))t===9?o+=4-(o+e.bsCount[m]+ +!!r)%4:o++;else break;i++}p=i>=a,c.push(e.bsCount[m]),e.bsCount[m]=e.sCount[m]+1+ +!!n,l.push(e.sCount[m]),e.sCount[m]=o-t,u.push(e.tShift[m]),e.tShift[m]=i-e.bMarks[m];continue}if(p)break;let r=!1;for(let t=0,i=d.length;t<i;t++)if(d[t](e,m,n,!0)){r=!0;break}if(r){e.lineMax=m,e.blkIndent!==0&&(s.push(e.bMarks[m]),c.push(e.bsCount[m]),u.push(e.tShift[m]),l.push(e.sCount[m]),e.sCount[m]-=e.blkIndent);break}s.push(e.bMarks[m]),c.push(e.bsCount[m]),u.push(e.tShift[m]),l.push(e.sCount[m]),e.sCount[m]=-1}let h=e.blkIndent;e.blkIndent=0;let g=e.push(`blockquote_open`,`blockquote`,1);g.markup=`>`;let _=[t,0];g.map=_,e.md.block.tokenize(e,t,m);let v=e.push(`blockquote_close`,`blockquote`,-1);v.markup=`>`,e.lineMax=o,e.parentType=f,_[1]=e.line;for(let n=0;n<u.length;n++)e.bMarks[n+t]=s[n],e.tShift[n+t]=u[n],e.sCount[n+t]=l[n],e.bsCount[n+t]=c[n];return e.blkIndent=h,!0}function zo(e,t,n,r){let i=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4)return!1;let a=e.bMarks[t]+e.tShift[t],o=e.src.charCodeAt(a++);if(o!==42&&o!==45&&o!==95)return!1;let s=1;for(;a<i;){let t=e.src.charCodeAt(a++);if(t!==o&&!W(t))return!1;t===o&&s++}if(s<3)return!1;if(r)return!0;e.line=t+1;let c=e.push(`hr`,`hr`,0);return c.map=[t,e.line],c.markup=Array(s+1).join(String.fromCharCode(o)),!0}function Bo(e,t){let n=e.eMarks[t],r=e.bMarks[t]+e.tShift[t],i=e.src.charCodeAt(r++);return i!==42&&i!==45&&i!==43||r<n&&!W(e.src.charCodeAt(r))?-1:r}function Vo(e,t){let n=e.bMarks[t]+e.tShift[t],r=e.eMarks[t],i=n;if(i+1>=r)return-1;let a=e.src.charCodeAt(i++);if(a<48||a>57)return-1;for(;;){if(i>=r)return-1;if(a=e.src.charCodeAt(i++),a>=48&&a<=57){if(i-n>=10)return-1;continue}if(a===41||a===46)break;return-1}return i<r&&(a=e.src.charCodeAt(i),!W(a))?-1:i}function Ho(e,t){let n=e.level+2;for(let r=t+2,i=e.tokens.length-2;r<i;r++)e.tokens[r].level===n&&e.tokens[r].type===`paragraph_open`&&(e.tokens[r+2].hidden=!0,e.tokens[r].hidden=!0,r+=2)}function Uo(e,t,n,r){let i,a,o,s,c=t,l=!0;if(e.sCount[c]-e.blkIndent>=4||e.listIndent>=0&&e.sCount[c]-e.listIndent>=4&&e.sCount[c]<e.blkIndent)return!1;let u=!1;r&&e.parentType===`paragraph`&&e.sCount[c]>=e.blkIndent&&(u=!0);let d,f,p;if((p=Vo(e,c))>=0){if(d=!0,o=e.bMarks[c]+e.tShift[c],f=Number(e.src.slice(o,p-1)),u&&f!==1)return!1}else if((p=Bo(e,c))>=0)d=!1;else return!1;if(u&&e.skipSpaces(p)>=e.eMarks[c])return!1;if(r)return!0;let m=e.src.charCodeAt(p-1),h=e.tokens.length;d?(s=e.push(`ordered_list_open`,`ol`,1),f!==1&&(s.attrs=[[`start`,f]])):s=e.push(`bullet_list_open`,`ul`,1);let g=[c,0];s.map=g,s.markup=String.fromCharCode(m);let _=!1,v=e.md.block.ruler.getRules(`list`),y=e.parentType;for(e.parentType=`list`;c<n;){a=p,i=e.eMarks[c];let t=e.sCount[c]+p-(e.bMarks[c]+e.tShift[c]),r=t;for(;a<i;){let t=e.src.charCodeAt(a);if(t===9)r+=4-(r+e.bsCount[c])%4;else if(t===32)r++;else break;a++}let u=a,f;f=u>=i?1:r-t,f>4&&(f=1);let h=t+f;s=e.push(`list_item_open`,`li`,1),s.markup=String.fromCharCode(m);let g=[c,0];s.map=g,d&&(s.info=e.src.slice(o,p-1));let y=e.tight,b=e.tShift[c],x=e.sCount[c],S=e.listIndent;if(e.listIndent=e.blkIndent,e.blkIndent=h,e.tight=!0,e.tShift[c]=u-e.bMarks[c],e.sCount[c]=r,u>=i&&e.isEmpty(c+1)?e.line=Math.min(e.line+2,n):e.md.block.tokenize(e,c,n),(!e.tight||_)&&(l=!1),_=e.line-c>1&&e.isEmpty(e.line-1),e.blkIndent=e.listIndent,e.listIndent=S,e.tShift[c]=b,e.sCount[c]=x,e.tight=y,s=e.push(`list_item_close`,`li`,-1),s.markup=String.fromCharCode(m),c=e.line,g[1]=c,c>=n||e.sCount[c]<e.blkIndent||e.sCount[c]-e.blkIndent>=4)break;let C=!1;for(let t=0,r=v.length;t<r;t++)if(v[t](e,c,n,!0)){C=!0;break}if(C)break;if(d){if(p=Vo(e,c),p<0)break;o=e.bMarks[c]+e.tShift[c]}else if(p=Bo(e,c),p<0)break;if(m!==e.src.charCodeAt(p-1))break}return s=d?e.push(`ordered_list_close`,`ol`,-1):e.push(`bullet_list_close`,`ul`,-1),s.markup=String.fromCharCode(m),g[1]=c,e.line=c,e.parentType=y,l&&Ho(e,h),!0}function Wo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t],o=t+1;if(e.sCount[t]-e.blkIndent>=4||e.src.charCodeAt(i)!==91)return!1;function s(t){let n=e.lineMax;if(t>=n||e.isEmpty(t))return null;let r=!1;if(e.sCount[t]-e.blkIndent>3&&(r=!0),e.sCount[t]<0&&(r=!0),!r){let r=e.md.block.ruler.getRules(`reference`),i=e.parentType;e.parentType=`reference`;let a=!1;for(let i=0,o=r.length;i<o;i++)if(r[i](e,t,n,!0)){a=!0;break}if(e.parentType=i,a)return null}let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];return e.src.slice(i,a+1)}let c=e.src.slice(i,a+1);a=c.length;let l=-1;for(i=1;i<a;i++){let e=c.charCodeAt(i);if(e===91)return!1;if(e===93){l=i;break}else if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(e===92&&(i++,i<a&&c.charCodeAt(i)===10)){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}}if(l<0||c.charCodeAt(l+1)!==58)return!1;for(i=l+2;i<a;i++){let e=c.charCodeAt(i);if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(!W(e))break}let u=e.md.helpers.parseLinkDestination(c,i,a);if(!u.ok)return!1;let d=e.md.normalizeLink(u.str);if(!e.md.validateLink(d))return!1;i=u.pos;let f=i,p=o,m=i;for(;i<a;i++){let e=c.charCodeAt(i);if(e===10){let e=s(o);e!==null&&(c+=e,a=c.length,o++)}else if(!W(e))break}let h=e.md.helpers.parseLinkTitle(c,i,a);for(;h.can_continue;){let t=s(o);if(t===null)break;c+=t,i=a,a=c.length,o++,h=e.md.helpers.parseLinkTitle(c,i,a,h)}let g;for(i<a&&m!==i&&h.ok?(g=h.str,i=h.pos):(g=``,i=f,o=p);i<a&&W(c.charCodeAt(i));)i++;if(i<a&&c.charCodeAt(i)!==10&&g)for(g=``,i=f,o=p;i<a&&W(c.charCodeAt(i));)i++;if(i<a&&c.charCodeAt(i)!==10)return!1;let _=Ba(c.slice(1,l));if(!_)return!1;if(r)return!0;e.env.references===void 0&&(e.env.references={}),e.env.references[_]===void 0&&(e.env.references[_]={title:g,href:d});let v=e.push(`reference_definition`,``,0);v.map=[t,o],v.hidden=!0;let y=Object.create(null);return y.label=_,v.meta=y,e.line=o,!0}var Go=`address.article.aside.base.basefont.blockquote.body.caption.center.col.colgroup.dd.details.dialog.dir.div.dl.dt.fieldset.figcaption.figure.footer.form.frame.frameset.h1.h2.h3.h4.h5.h6.head.header.hr.html.iframe.legend.li.link.main.menu.menuitem.nav.noframes.ol.optgroup.option.p.param.search.section.summary.table.tbody.td.tfoot.th.thead.title.tr.track.ul`.split(`.`),Ko=`<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*\\/?>`,qo=`<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>`,Jo=RegExp(`^(?:${Ko}|${qo}|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<[?][\\s\\S]*?[?]>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`),Yo=RegExp(`^(?:${Ko}|${qo})`),J=[[/^<(script|pre|style|textarea)(?=(\s|>|$))/i,/<\/(script|pre|style|textarea)>/i,!0],[/^<!--/,/-->/,!0],[/^<\?/,/\?>/,!0],[/^<![A-Za-z]/,/>/,!0],[/^<!\[CDATA\[/,/\]\]>/,!0],[RegExp(`^</?(${Go.join(`|`)})(?=(\\s|/?>|$))`,`i`),/^$/,!0],[RegExp(`${Yo.source}\\s*$`),/^$/,!1]];function Xo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4||!e.md.options.html||e.src.charCodeAt(i)!==60)return!1;let o=e.src.slice(i,a),s=0;for(;s<J.length&&!J[s][0].test(o);s++);if(s===J.length)return!1;if(r)return J[s][2];let c=t+1,l=J[s][1].test(``);if(!J[s][1].test(o)){for(;c<n&&!(e.sCount[c]<e.blkIndent&&(l||!e.isEmpty(c)));c++)if(i=e.bMarks[c]+e.tShift[c],a=e.eMarks[c],o=e.src.slice(i,a),J[s][1].test(o)){o.length!==0&&c++;break}}e.line=c;let u=e.push(`html_block`,``,0);return u.map=[t,c],u.content=e.getLines(t,c,e.blkIndent,!0),!0}function Zo(e,t,n,r){let i=e.bMarks[t]+e.tShift[t],a=e.eMarks[t];if(e.sCount[t]-e.blkIndent>=4)return!1;let o=e.src.charCodeAt(i);if(o!==35||i>=a)return!1;let s=1;for(o=e.src.charCodeAt(++i);o===35&&i<a&&s<=6;)s++,o=e.src.charCodeAt(++i);if(s>6||i<a&&!W(o))return!1;if(r)return!0;a=e.skipSpacesBack(a,i);let c=e.skipCharsBack(a,35,i);c>i&&W(e.src.charCodeAt(c-1))&&(a=c),e.line=t+1;let l=e.push(`heading_open`,`h${s}`,1);l.markup=`########`.slice(0,s),l.map=[t,e.line];let u=e.push(`inline`,``,0);u.content=Ha(e.src.slice(i,a)),u.map=[t,e.line],u.children=[];let d=e.push(`heading_close`,`h${s}`,-1);return d.markup=`########`.slice(0,s),!0}function Qo(e,t,n){let r=e.md.block.ruler.getRules(`paragraph`);if(e.sCount[t]-e.blkIndent>=4)return!1;let i=e.parentType;e.parentType=`paragraph`;let a=0,o,s=t+1;for(;s<n&&!e.isEmpty(s);s++){if(e.sCount[s]-e.blkIndent>3)continue;if(e.sCount[s]>=e.blkIndent){let t=e.bMarks[s]+e.tShift[s],n=e.eMarks[s];if(t<n&&(o=e.src.charCodeAt(t),(o===45||o===61)&&(t=e.skipChars(t,o),t=e.skipSpaces(t),t>=n))){a=o===61?1:2;break}}if(e.sCount[s]<0)continue;let t=!1;for(let i=0,a=r.length;i<a;i++)if(r[i](e,s,n,!0)){t=!0;break}if(t)break}if(!a)return e.parentType=i,!1;let c=Ha(e.getLines(t,s,e.blkIndent,!1));e.line=s+1;let l=e.push(`heading_open`,`h${a}`,1);l.markup=String.fromCharCode(o),l.map=[t,e.line];let u=e.push(`inline`,``,0);u.content=c,u.map=[t,e.line-1],u.children=[];let d=e.push(`heading_close`,`h${a}`,-1);return d.markup=String.fromCharCode(o),e.parentType=i,!0}function $o(e,t,n){let r=e.md.block.ruler.getRules(`paragraph`),i=e.parentType,a=t+1;for(e.parentType=`paragraph`;a<n&&!e.isEmpty(a);a++){if(e.sCount[a]-e.blkIndent>3||e.sCount[a]<0)continue;let t=!1;for(let i=0,o=r.length;i<o;i++)if(r[i](e,a,n,!0)){t=!0;break}if(t)break}let o=Ha(e.getLines(t,a,e.blkIndent,!1));e.line=a;let s=e.push(`paragraph_open`,`p`,1);s.map=[t,e.line];let c=e.push(`inline`,``,0);return c.content=o,c.map=[t,e.line],c.children=[],e.push(`paragraph_close`,`p`,-1),e.parentType=i,!0}var es=[[`table`,Fo,[`paragraph`,`reference`]],[`code`,Io],[`fence`,Lo,[`paragraph`,`reference`,`blockquote`,`list`]],[`blockquote`,Ro,[`paragraph`,`reference`,`blockquote`,`list`]],[`hr`,zo,[`paragraph`,`reference`,`blockquote`,`list`]],[`list`,Uo,[`paragraph`,`reference`,`blockquote`]],[`reference`,Wo],[`html_block`,Xo,[`paragraph`,`reference`,`blockquote`]],[`heading`,Zo,[`paragraph`,`reference`,`blockquote`]],[`lheading`,Qo],[`paragraph`,$o]],ts=class{constructor(){G(this,`ruler`,new Za),G(this,`State`,jo);for(let e=0;e<es.length;e++)this.ruler.push(es[e][0],es[e][1],{alt:(es[e][2]||[]).slice()})}tokenize(e,t,n){let r=this.ruler.getRules(``),i=r.length,a=e.md.options.maxNesting,o=t,s=!1;for(;o<n&&(e.line=o=e.skipEmptyLines(o),!(o>=n||e.sCount[o]<e.blkIndent));){if(e.level>=a){e.line=n;break}let t=e.line,c=!1;for(let a=0;a<i;a++)if(c=r[a](e,o,n,!1),c){if(t>=e.line)throw Error(`block rule didn't increment state.line`);break}if(!c)throw Error(`none of the block rules matched`);e.tight=!s,e.isEmpty(e.line-1)&&(s=!0),o=e.line,o<n&&e.isEmpty(o)&&(s=!0,o++,e.line=o)}}parse(e,t,n,r){if(!e)return;let i=new this.State(e,t,n,r);this.tokenize(i,i.line,i.lineMax)}},ns=class{constructor(e,t,n,r){G(this,`pos`,0),G(this,`level`,0),G(this,`pending`,``),G(this,`pendingLevel`,0),G(this,`cache`,{}),G(this,`backticks`,{}),G(this,`backticksScanned`,!1),G(this,`linkLevel`,0),G(this,`delimiters`,[]),G(this,`_prev_delimiters`,[]),G(this,`Token`,K),this.src=e,this.env=n,this.md=t,this.tokens=r,this.tokens_meta=Array(r.length),this.posMax=this.src.length}pushPending(){let e=new K(`text`,``,0);return e.content=this.pending,e.level=this.pendingLevel,this.tokens.push(e),this.pending=``,e}push(e,t,n){this.pending&&this.pushPending();let r=new K(e,t,n),i;return n<0&&(this.level--,this.delimiters=this._prev_delimiters.pop()),r.level=this.level,n>0&&(this.level++,this._prev_delimiters.push(this.delimiters),this.delimiters=[],i={delimiters:this.delimiters}),this.pendingLevel=this.level,this.tokens.push(r),this.tokens_meta.push(i),r}scanDelims(e,t){let n=this.posMax,r=this.src.charCodeAt(e),i;if(e===0)i=32;else if(e===1)i=this.src.charCodeAt(0),(i&63488)==55296&&(i=65533);else if(i=this.src.charCodeAt(e-1),(i&64512)==56320){let t=this.src.charCodeAt(e-2);i=(t&64512)==55296?65536+(t-55296<<10)+(i-56320):65533}else (i&64512)==55296&&(i=65533);let a=e;for(;a<n&&this.src.charCodeAt(a)===r;)a++;let o=a-e,s=a<n?this.src.charCodeAt(a):32;if((s&64512)==55296){let e=this.src.charCodeAt(a+1);s=(e&64512)==56320?65536+(s-55296<<10)+(e-56320):65533}else (s&64512)==56320&&(s=65533);let c=za(i)||Ra(i),l=za(s)||Ra(s),u=Ia(i),d=Ia(s),f=!d&&(!l||u||c),p=!u&&(!c||d||l);return{can_open:f&&(t||!p||c),can_close:p&&(t||!f||l),length:o}}};function rs(e){switch(e){case 10:case 33:case 35:case 36:case 37:case 38:case 42:case 43:case 45:case 58:case 60:case 61:case 62:case 64:case 91:case 92:case 93:case 94:case 95:case 96:case 123:case 125:case 126:return!0;default:return!1}}function is(e,t){let n=e.pos;for(;n<e.posMax&&!rs(e.src.charCodeAt(n));)n++;return n===e.pos?!1:(t||(e.pending+=e.src.slice(e.pos,n)),e.pos=n,!0)}function as(e){return e>=65&&e<=90||e>=97&&e<=122}function os(e){return e>=65&&e<=90||e>=97&&e<=122||e>=48&&e<=57||e===43||e===45||e===46}function ss(e,t){if(!e.md.options.linkify||e.linkLevel>0)return!1;let n=e.pos,r=e.posMax;if(n+3>r||e.src.charCodeAt(n)!==58||e.src.charCodeAt(n+1)!==47||e.src.charCodeAt(n+2)!==47)return!1;let i=n-Math.min(10,e.pending.length,n),a=n;for(;a>i&&os(e.src.charCodeAt(a-1));)a--;if(a===n||!as(e.src.charCodeAt(a)))return!1;let o=n-a,s=e.md.linkify.matchAtStart(e.src.slice(a));if(!s)return!1;let c=s.url;if(c.length<=o)return!1;let l=c.length;for(;l>0&&c.charCodeAt(l-1)===42;)l--;l!==c.length&&(c=c.slice(0,l));let u=e.md.normalizeLink(c);if(!e.md.validateLink(u))return!1;if(!t){e.pending=e.pending.slice(0,-o);let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,u]],t.markup=`linkify`,t.info=`auto`;let n=e.push(`text`,``,0);n.content=e.md.normalizeLinkText(c);let r=e.push(`link_close`,`a`,-1);r.markup=`linkify`,r.info=`auto`}return e.pos+=c.length-o,!0}function cs(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==10)return!1;let r=e.pending.length-1,i=e.posMax;if(!t)if(r>=0&&e.pending.charCodeAt(r)===32)if(r>=1&&e.pending.charCodeAt(r-1)===32){let t=r-1;for(;t>=1&&e.pending.charCodeAt(t-1)===32;)t--;e.pending=e.pending.slice(0,t),e.push(`hardbreak`,`br`,0)}else e.pending=e.pending.slice(0,-1),e.push(`softbreak`,`br`,0);else e.push(`softbreak`,`br`,0);for(n++;n<i&&W(e.src.charCodeAt(n));)n++;return e.pos=n,!0}var ls=[];for(let e=0;e<256;e++)ls.push(0);`\\!"#$%&'()*+,./:;<=>?@[]^_\`{|}~-`.split(``).forEach(function(e){ls[e.charCodeAt(0)]=1});function us(e,t){let n=e.pos,r=e.posMax;if(e.src.charCodeAt(n)!==92||(n++,n>=r))return!1;let i=e.src.charCodeAt(n);if(i===10){for(t||e.push(`hardbreak`,`br`,0),n++;n<r&&(i=e.src.charCodeAt(n),W(i));)n++;return e.pos=n,!0}if(i===32){if(!t){let t=e.push(`text_special`,``,0);t.content=`\\`,t.markup=`\\`,t.info=`escape`}return e.pos=n,!0}let a=e.src[n];if(i>=55296&&i<=56319&&n+1<r){let t=e.src.charCodeAt(n+1);t>=56320&&t<=57343&&(a+=e.src[n+1],n++)}let o=`\\`+a;if(!t){let t=e.push(`text_special`,``,0);i<256&&ls[i]!==0?t.content=a:t.content=o,t.markup=o,t.info=`escape`}return e.pos=n+1,!0}function ds(e){let t={},n=0;for(;(n=e.indexOf("`",n))!==-1;){let r=n;for(;e.charCodeAt(++n)===96;);t[n-r]=r}return t}function fs(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==96)return!1;let r=e.posMax,i=n+1;for(;i<r&&e.src.charCodeAt(i)===96;)i++;let a=e.src.slice(n,i),o=a.length;if(e.backticksScanned||=(e.backticks=ds(e.src),!0),(e.backticks[o]??-1)>=i){let n=i,s;for(;(s=e.src.indexOf("`",n))!==-1&&s<r;){for(n=s+1;e.src.charCodeAt(n)===96;)n++;if(n>r)break;if(n-s===o){if(!t){let t=e.push(`code_inline`,`code`,0);t.markup=a;let n=e.src.slice(i,s).replace(/\n/g,` `);n.startsWith(` `)&&n.endsWith(` `)&&/[^ ]/.test(n)&&(n=n.slice(1,-1)),t.content=n}return e.pos=n,!0}}}return t||(e.pending+=a),e.pos=i,!0}function ps(e,t){let n=e.pos,r=e.src.charCodeAt(n);if(t||r!==126)return!1;let i=e.scanDelims(e.pos,!0),a=i.length,o=String.fromCharCode(r);if(a<2)return!1;let s;a%2&&(s=e.push(`text`,``,0),s.content=o,a--);for(let t=0;t<a;t+=2)s=e.push(`text`,``,0),s.content=o+o,e.delimiters.push({marker:r,length:0,token:e.tokens.length-1,end:-1,open:i.can_open,close:i.can_close});return e.pos+=i.length,!0}function ms(e,t){let n,r=[],i=t.length;for(let a=0;a<i;a++){let i=t[a];if(i.marker!==126||i.end===-1)continue;let o=t[i.end];n=e.tokens[i.token],n.type=`s_open`,n.tag=`s`,n.nesting=1,n.markup=`~~`,n.content=``,n=e.tokens[o.token],n.type=`s_close`,n.tag=`s`,n.nesting=-1,n.markup=`~~`,n.content=``,e.tokens[o.token-1].type===`text`&&e.tokens[o.token-1].content===`~`&&r.push(o.token-1)}for(;r.length;){let t=r.pop(),i=t+1;for(;i<e.tokens.length&&e.tokens[i].type===`s_close`;)i++;i--,t!==i&&(n=e.tokens[i],e.tokens[i]=e.tokens[t],e.tokens[t]=n)}}function hs(e){let t=e.tokens_meta,n=e.tokens_meta.length;ms(e,e.delimiters);for(let r=0;r<n;r++){let n=t[r]?.delimiters;n&&ms(e,n)}}var gs={tokenize:ps,postProcess:hs};function _s(e,t){let n=e.pos,r=e.src.charCodeAt(n);if(t||r!==95&&r!==42)return!1;let i=e.scanDelims(e.pos,r===42);for(let t=0;t<i.length;t++){let t=e.push(`text`,``,0);t.content=String.fromCharCode(r),e.delimiters.push({marker:r,length:i.length,token:e.tokens.length-1,end:-1,open:i.can_open,close:i.can_close})}return e.pos+=i.length,!0}function vs(e,t){let n=t.length;for(let r=n-1;r>=0;r--){let n=t[r];if(n.marker!==95&&n.marker!==42||n.end===-1)continue;let i=t[n.end],a=r>0&&t[r-1].end===n.end+1&&t[r-1].marker===n.marker&&t[r-1].token===n.token-1&&t[n.end+1].token===i.token+1,o=String.fromCharCode(n.marker),s=e.tokens[n.token];s.type=a?`strong_open`:`em_open`,s.tag=a?`strong`:`em`,s.nesting=1,s.markup=a?o+o:o,s.content=``;let c=e.tokens[i.token];c.type=a?`strong_close`:`em_close`,c.tag=a?`strong`:`em`,c.nesting=-1,c.markup=a?o+o:o,c.content=``,a&&(e.tokens[t[r-1].token].content=``,e.tokens[t[n.end+1].token].content=``,r--)}}function ys(e){let t=e.tokens_meta,n=e.tokens_meta.length;vs(e,e.delimiters);for(let r=0;r<n;r++){let n=t[r]?.delimiters;n&&vs(e,n)}}var bs={tokenize:_s,postProcess:ys};function xs(e,t){let n,r,i,a,o=``,s=``,c=e.pos,l=!0;if(e.src.charCodeAt(e.pos)!==91)return!1;let u=e.pos,d=e.posMax,f=e.pos+1,p=e.md.helpers.parseLinkLabel(e,e.pos,!0);if(p<0)return!1;let m=p+1;if(m<d&&e.src.charCodeAt(m)===40){for(l=!1,m++;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);if(m>=d)return!1;if(c=m,i=e.md.helpers.parseLinkDestination(e.src,m,e.posMax),i.ok){for(o=e.md.normalizeLink(i.str),e.md.validateLink(o)?m=i.pos:o=``,c=m;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);if(i=e.md.helpers.parseLinkTitle(e.src,m,e.posMax),m<d&&c!==m&&i.ok)for(s=i.str,m=i.pos;m<d&&(n=e.src.charCodeAt(m),!(!W(n)&&n!==10));m++);}(m>=d||e.src.charCodeAt(m)!==41)&&(l=!0),m++}if(l){if(e.env.references===void 0)return!1;if(m<d&&e.src.charCodeAt(m)===91?(c=m+1,m=e.md.helpers.parseLinkLabel(e,m),m>=0?r=e.src.slice(c,m++):m=p+1):m=p+1,r||=e.src.slice(f,p),r=Ba(r),a=e.env.references[r],!a)return e.pos=u,!1;o=a.href,s=a.title}if(!t){e.pos=f,e.posMax=p;let t=e.push(`link_open`,`a`,1),n=[[`href`,o]];if(t.attrs=n,s&&n.push([`title`,s]),r){let e=Object.create(null);e.label=r,t.meta=e}e.linkLevel++,e.md.inline.tokenize(e),e.linkLevel--,e.push(`link_close`,`a`,-1)}return e.pos=m,e.posMax=d,!0}function Ss(e,t){let n,r,i,a,o,s,c,l,u=``,d=e.pos,f=e.posMax;if(e.src.charCodeAt(e.pos)!==33||e.src.charCodeAt(e.pos+1)!==91)return!1;let p=e.pos+2,m=e.md.helpers.parseLinkLabel(e,e.pos+1,!1);if(m<0)return!1;if(a=m+1,a<f&&e.src.charCodeAt(a)===40){for(a++;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);if(a>=f)return!1;for(l=a,s=e.md.helpers.parseLinkDestination(e.src,a,e.posMax),s.ok&&(u=e.md.normalizeLink(s.str),e.md.validateLink(u)?a=s.pos:u=``),l=a;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);if(s=e.md.helpers.parseLinkTitle(e.src,a,e.posMax),a<f&&l!==a&&s.ok)for(c=s.str,a=s.pos;a<f&&(n=e.src.charCodeAt(a),!(!W(n)&&n!==10));a++);else c=``;if(a>=f||e.src.charCodeAt(a)!==41)return e.pos=d,!1;a++}else{if(e.env.references===void 0)return!1;if(a<f&&e.src.charCodeAt(a)===91?(l=a+1,a=e.md.helpers.parseLinkLabel(e,a),a>=0?i=e.src.slice(l,a++):a=m+1):a=m+1,i||=e.src.slice(p,m),i=Ba(i),o=e.env.references[i],!o)return e.pos=d,!1;u=o.href,c=o.title}if(!t){r=e.src.slice(p,m);let t=[];e.md.inline.parse(r,e.md,e.env,t);let n=e.push(`image`,`img`,0),a=[[`src`,u],[`alt`,``]];if(n.attrs=a,n.children=t,n.content=r,c&&a.push([`title`,c]),i){let e=Object.create(null);e.label=i,n.meta=e}}return e.pos=a,e.posMax=f,!0}var Cs=/^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/,ws=/^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;function Ts(e,t){let n=e.pos;if(e.src.charCodeAt(n)!==60)return!1;let r=e.pos,i=e.posMax;for(;;){if(++n>=i)return!1;let t=e.src.charCodeAt(n);if(t===60)return!1;if(t===62)break}let a=e.src.slice(r+1,n);if(ws.test(a)){let n=e.md.normalizeLink(a);if(!e.md.validateLink(n))return!1;if(!t){let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,n]],t.markup=`autolink`,t.info=`auto`;let r=e.push(`text`,``,0);r.content=e.md.normalizeLinkText(a);let i=e.push(`link_close`,`a`,-1);i.markup=`autolink`,i.info=`auto`}return e.pos+=a.length+2,!0}if(Cs.test(a)){let n=e.md.normalizeLink(`mailto:${a}`);if(!e.md.validateLink(n))return!1;if(!t){let t=e.push(`link_open`,`a`,1);t.attrs=[[`href`,n]],t.markup=`autolink`,t.info=`auto`;let r=e.push(`text`,``,0);r.content=e.md.normalizeLinkText(a);let i=e.push(`link_close`,`a`,-1);i.markup=`autolink`,i.info=`auto`}return e.pos+=a.length+2,!0}return!1}function Es(e){return/^<a[>\s]/i.test(e)}function Ds(e){return/^<\/a\s*>/i.test(e)}function Os(e){let t=e|32;return t>=97&&t<=122}function ks(e,t){if(!e.md.options.html)return!1;let n=e.posMax,r=e.pos;if(e.src.charCodeAt(r)!==60||r+2>=n)return!1;let i=e.src.charCodeAt(r+1);if(i!==33&&i!==63&&i!==47&&!Os(i))return!1;let a=e.src.slice(r).match(Jo);if(!a)return!1;if(!t){let t=e.push(`html_inline`,``,0);t.content=a[0],Es(t.content)&&e.linkLevel++,Ds(t.content)&&e.linkLevel--}return e.pos+=a[0].length,!0}var As=/^&#((?:x[a-f0-9]{1,6}|[0-9]{1,7}));/i,js=/^&([a-z][a-z0-9]{1,31});/i;function Ms(e,t){let n=e.pos,r=e.posMax;if(e.src.charCodeAt(n)!==38||n+1>=r)return!1;if(e.src.charCodeAt(n+1)===35){let r=e.src.slice(n).match(As);if(r){if(!t){let t=r[1][0].toLowerCase()===`x`?parseInt(r[1].slice(1),16):parseInt(r[1],10),n=e.push(`text_special`,``,0);n.content=wa(t)?V(t):V(65533),n.markup=r[0],n.info=`entity`}return e.pos+=r[0].length,!0}}else{let r=e.src.slice(n).match(js);if(r){let n=Bi(r[0]);if(n!==r[0]){if(!t){let t=e.push(`text_special`,``,0);t.content=n,t.markup=r[0],t.info=`entity`}return e.pos+=r[0].length,!0}}}return!1}function Ns(e){let t={},n=e.length;if(!n)return;let r=0,i=-2,a=[];for(let o=0;o<n;o++){let n=e[o];if(a.push(0),(e[r].marker!==n.marker||i!==n.token-1)&&(r=o),i=n.token,n.length=n.length||0,!n.close)continue;t.hasOwnProperty(n.marker)||(t[n.marker]=[-1,-1,-1,-1,-1,-1]);let s=t[n.marker][(n.open?3:0)+n.length%3],c=r-a[r]-1,l=c;for(;c>s;c-=a[c]+1){let t=e[c];if(t.marker===n.marker&&t.open&&t.end<0){let r=!1;if((t.close||n.open)&&(t.length+n.length)%3==0&&(t.length%3!=0||n.length%3!=0)&&(r=!0),!r){let r=c>0&&!e[c-1].open?a[c-1]+1:0;a[o]=o-c+r,a[c]=r,n.open=!1,t.end=o,t.close=!1,l=-1,i=-2;break}}}l!==-1&&(t[n.marker][(n.open?3:0)+(n.length||0)%3]=l)}}function Ps(e){let t=e.tokens_meta,n=e.tokens_meta.length;Ns(e.delimiters);for(let e=0;e<n;e++){let n=t[e]?.delimiters;n&&Ns(n)}}function Fs(e){let t,n,r=0,i=e.tokens,a=e.tokens.length;for(t=n=0;t<a;t++)i[t].nesting<0&&r--,i[t].level=r,i[t].nesting>0&&r++,i[t].type===`text`&&t+1<a&&i[t+1].type===`text`?i[t+1].content=i[t].content+i[t+1].content:(t!==n&&(i[n]=i[t]),n++);t!==n&&(i.length=n)}var Is=[[`text`,is],[`linkify`,ss],[`newline`,cs],[`escape`,us],[`backticks`,fs],[`strikethrough`,gs.tokenize],[`emphasis`,bs.tokenize],[`link`,xs],[`image`,Ss],[`autolink`,Ts],[`html_inline`,ks],[`entity`,Ms]],Ls=[[`balance_pairs`,Ps],[`strikethrough`,gs.postProcess],[`emphasis`,bs.postProcess],[`fragments_join`,Fs]],Rs=class{constructor(){G(this,`ruler`,new Za),G(this,`ruler2`,new Za),G(this,`State`,ns);for(let e=0;e<Is.length;e++)this.ruler.push(Is[e][0],Is[e][1]);for(let e=0;e<Ls.length;e++)this.ruler2.push(Ls[e][0],Ls[e][1])}skipToken(e){let t=e.pos,n=this.ruler.getRules(``),r=n.length,i=e.md.options.maxNesting,a=e.cache;if(a[t]!==void 0){e.pos=a[t];return}let o=!1;if(e.level<i){for(let i=0;i<r;i++)if(e.level++,o=n[i](e,!0),e.level--,o){if(t>=e.pos)throw Error(`inline rule didn't increment state.pos`);break}}else e.pos=e.posMax;o||e.pos++,a[t]=e.pos}tokenize(e){let t=this.ruler.getRules(``),n=t.length,r=e.posMax,i=e.md.options.maxNesting;for(;e.pos<r;){let a=e.pos,o=!1;if(e.level<i){for(let r=0;r<n;r++)if(o=t[r](e,!1),o){if(a>=e.pos)throw Error(`inline rule didn't increment state.pos`);break}}if(o){if(e.pos>=r)break;continue}e.pending+=e.src[e.pos++]}e.pending&&e.pushPending()}parse(e,t,n,r){let i=new this.State(e,t,n,r);this.tokenize(i);let a=this.ruler2.getRules(``),o=a.length;for(let e=0;e<o;e++)a[e](i)}},zs={default:{options:{html:!1,xhtmlOut:!1,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:100},components:{core:{},block:{},inline:{}}},zero:{options:{html:!1,xhtmlOut:!1,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:20},components:{core:{rules:[`normalize`,`block`,`strip_references`,`inline`,`text_join`]},block:{rules:[`paragraph`]},inline:{rules:[`text`],rules2:[`balance_pairs`,`fragments_join`]}}},commonmark:{options:{html:!0,xhtmlOut:!0,breaks:!1,langPrefix:`language-`,linkify:!1,typographer:!1,quotes:`“”‘’`,highlight:null,maxNesting:20},components:{core:{rules:[`normalize`,`block`,`strip_references`,`inline`,`text_join`]},block:{rules:[`blockquote`,`code`,`fence`,`heading`,`hr`,`html_block`,`lheading`,`list`,`reference`,`paragraph`]},inline:{rules:[`autolink`,`backticks`,`emphasis`,`entity`,`escape`,`html_inline`,`image`,`link`,`newline`,`text`],rules2:[`balance_pairs`,`emphasis`,`fragments_join`]}}}},Bs=/^(vbscript|javascript|file|data):/,Vs=/^data:image\/(gif|png|jpeg|webp);/,Hs=[`http:`,`https:`,`mailto:`],Y=class{validateLink(e){let t=e.trim().toLowerCase();return Bs.test(t)?Vs.test(t):!0}normalizeLink(e){let t=li(e,!0);if(t.hostname&&(!t.protocol||Hs.indexOf(t.protocol)>=0))try{t.hostname=va.toASCII(t.hostname)}catch{}return t.auth&&=N(t.auth),t.hostname&&=N(t.hostname),t.pathname&&=N(t.pathname),t.search&&=N(t.search),t.hash&&=N(t.hash),Zr(t)}normalizeLinkText(e){let t=li(e,!0);if(t.hostname&&(!t.protocol||Hs.indexOf(t.protocol)>=0))try{t.hostname=va.toUnicode(t.hostname)}catch{}return M(Zr(t),M.defaultChars+`%`)}constructor(...e){G(this,`inline`,new Rs),G(this,`block`,new ts),G(this,`core`,new Ao),G(this,`renderer`,new Qa),G(this,`linkify`,new Yi),G(this,`utils`,xa),G(this,`helpers`,Object.assign({},qa));let[t,n]=e;typeof t==`string`?(this.configure(t),n&&this.set(n)):(this.configure(`default`),this.set(t||{}))}set(e){return Object.assign(this.options,e),this}configure(e){let t;if(typeof e==`string`){let n=e;if(t=zs[n],!t)throw Error(`Wrong 'markdown-it' preset "${n}", check name`)}else t=e;if(!t)throw Error("Wrong `markdown-it` preset, can't be empty");t.options&&(this.options={...t.options});let n=t.components;if(n){[`core`,`block`,`inline`].forEach(e=>{let t=n[e]?.rules;t&&this[e].ruler.enableOnly(t)});let e=n.inline?.rules2;e&&this.inline.ruler2.enableOnly(e)}return this}enable(e,t=!1){let n=[];Array.isArray(e)||(e=[e]),[`core`,`block`,`inline`].forEach(t=>{n=n.concat(this[t].ruler.enable(e,!0))}),n=n.concat(this.inline.ruler2.enable(e,!0));let r=e.filter(e=>n.indexOf(e)<0);if(r.length&&!t)throw Error(`MarkdownIt. Failed to enable unknown rule(s): ${r}`);return this}disable(e,t=!1){let n=[];Array.isArray(e)||(e=[e]),[`core`,`block`,`inline`].forEach(t=>{n=n.concat(this[t].ruler.disable(e,!0))}),n=n.concat(this.inline.ruler2.disable(e,!0));let r=e.filter(e=>n.indexOf(e)<0);if(r.length&&!t)throw Error(`MarkdownIt. Failed to disable unknown rule(s): ${r}`);return this}use(e,...t){return e.apply(e,[this,...t]),this}parse(e,t){if(typeof e!=`string`)throw Error(`Input data should be a String`);let n=new this.core.State(e,this,t);return this.core.process(n),n.tokens}render(e,t={}){return this.renderer.render(this.parse(e,t),this.options,t)}parseInline(e,t){let n=new this.core.State(e,this,t);return n.inlineMode=!0,this.core.process(n),n.tokens}renderInline(e,t={}){return this.renderer.render(this.parseInline(e,t),this.options,t)}};G(Y,`Token`,K),G(Y,`Ruler`,Za),G(Y,`Renderer`,Qa),G(Y,`ParserCore`,Ao),G(Y,`StateCore`,$a),G(Y,`ParserBlock`,ts),G(Y,`StateBlock`,jo),G(Y,`ParserInline`,Rs),G(Y,`StateInline`,ns);var Us=Sa(Y),Ws=`<span class="doc-external-glyph" aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span>`;function Gs(e,t){let{file:n,pageUrl:r,library:i}=t,a=e.attrGet(`href`);if(a===null||n===void 0||i===void 0)return!1;let o=Dt(String(a),n,i);return o.kind===`page`?(e.attrSet(`href`,o.page.url+o.hash),e.attrSet(`data-doc-link`,``),!1):o.kind===`hash`?(e.attrSet(`href`,(r??``)+o.hash),e.attrSet(`data-doc-link`,``),!1):(e.attrSet(`href`,o.href),o.opensNewTab?(e.attrSet(`target`,`_blank`),e.attrSet(`rel`,`noopener noreferrer`),!0):!1)}function Ks(e){let t=e.env;for(let n of e.tokens){if(n.type!==`inline`||!n.children)continue;let r=n.children;for(let n=r.length-1;n>=0;--n){let i=r[n];if(i){if(i.type===`image`&&t.file!==void 0){let e=String(i.attrGet(`src`)??``);i.attrSet(`src`,Ot(e,t.file,t.imageUrls??{}))}else if(i.type===`link_open`){if(!Gs(i,t))continue;let a=r.findIndex((e,t)=>t>n&&e.type===`link_close`);if(a===-1)continue;let o=new e.Token(`html_inline`,``,0);o.content=Ws,r.splice(a+1,0,o)}}}}}function qs(e){let t=e.renderer.rules.fence,n=e.renderer.rules.table_open,r=e.renderer.rules.table_close,i=e.utils.escapeHtml,a=e=>`<div class="doc-nested-scroll" role="group" tabindex="0" aria-label="${i(e)}">`;e.renderer.rules.fence=(e,n,r,i,o)=>{let s=e[n].info.trim().split(/\s+/)[0]??``,c=t?t(e,n,r,i,o):``;return`${a(`${s||`Code`} code`)}${c}</div>`},e.renderer.rules.table_open=(e,t,r,i,o)=>{let s=e[t],c=n?n(e,t,r,i,o):o.renderToken(e,t,r);return s.level===0?c:`${a(`Table`)}${c}`},e.renderer.rules.table_close=(e,t,n,i,a)=>{let o=e[t],s=r?r(e,t,n,i,a):a.renderToken(e,t,n);return o.level===0?s:`${s}</div>`}}function Js(){let e=Us({html:!1,linkify:!1,typographer:!1,breaks:!1});return e.core.ruler.push(`docs_rewrite_links`,Ks),qs(e),e}var X=Js();function Ys(e){return e.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu,``).replace(/ /g,`-`)}function Xs(){let e=new Set,t=new Map;return n=>{let r=Ys(n),i=r,a=t.get(r)??0;for(;e.has(i);)a+=1,i=`${r}-${a}`;return t.set(r,a),e.add(i),i}}function Zs(e){return e?.children?e.children.map(e=>e.type===`text`||e.type===`code_inline`||e.type===`image`?e.content:e.type===`softbreak`||e.type===`hardbreak`?` `:``).join(``):e?.content??``}function Qs(e){let t=X.parse(e.markdown,{}),n=Xs(),r=[],i={id:e.path,pagePath:e.path,pageTitle:e.title,groupKey:e.groupKey,groupTitle:e.groupTitle,heading:e.title,headingId:``,text:``},a=[],o=!1;function s(){i.text=a.join(` `).replace(/\s+/g,` `).trim(),a.length=0,(i.text!==``||i.headingId!==``)&&r.push(i)}return t.forEach((r,c)=>{if(r.type===`heading_open`){let a=t[c+1],l=a?Zs(a):``,u=n(l);if(r.tag===`h1`&&!o){o=!0;return}s(),i={...i,id:`${e.path}#${u}`,heading:l,headingId:u,text:``};return}let l=t[c-1]?.type===`heading_open`;r.type===`inline`&&!l?a.push(Zs(r)):r.type===`fence`&&r.info.trim()!==`mermaid`&&a.push(r.content)}),s(),r}function $s(e,t){let n=[];for(let r of le(e,{minimumWordLength:2})){let e=fe(t,r);e.length>0&&n.push({word:r,alsoSearching:e})}return n}var ec=40;function tc(e){let t=e.pages.flatMap(e=>Qs(e)).map(e=>pe(e,[{name:`heading`,text:e.heading,weight:3},{name:`pageTitle`,text:e.pageTitle,weight:2},{name:`text`,text:e.text,weight:1}]));return{search(n){let r=$s(n,e.synonyms),i=ue(t,n,{synonyms:e.synonyms,minimumWordLength:2,requireEveryWord:!1});return i.sort((e,t)=>t.matchedWordCount-e.matchedWordCount||t.score-e.score),{hits:i.slice(0,ec).map(e=>({section:e.item,score:e.score,matchedTerms:e.matchedTerms,snippet:Yt(e.item.text,e.matchedTerms)})),totalHits:i.length,expansions:r}}}}function nc(e,t){let n=null;return{outcome:p(()=>{let r=t.value.trim();return r===``?null:(n??=tc(e),n.search(r))})}}function rc(e){r(e,e=>{document.title=`${e} · Docs · Sentinel`},{immediate:!0,flush:`post`})}function Z(e){return ge.sanitize(e,{ADD_ATTR:[`target`]})}var ic=/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i,ac=/^Figure:\s*/i,oc=/^In words:?$/i;function sc(e){let t=[],n=null;for(let r of e)n?(n.push(r),r.nesting===-1&&r.level===0&&(t.push(n),n=null)):r.nesting===1?n=[r]:t.push([r]);return t}function cc(e,t){return X.renderer.render(e,X.options,t)}function lc(e){return e?.children?.filter(e=>!(e.type===`text`&&e.content===``))}function uc(e){return e[0]?.type===`paragraph_open`?e[1]:void 0}function dc(e){let t=lc(uc(e));return!t||t.length!==3||t[0]?.type!==`em_open`||t[2]?.type!==`em_close`?null:t[1]?.content??null}function fc(e){let t=lc(uc(e));return!t||t.length!==3?!1:t[0]?.type===`strong_open`&&t[2]?.type===`strong_close`&&oc.test(t[1]?.content??``)}function pc(e){let t=e[0]?.type;return t===`bullet_list_open`||t===`ordered_list_open`||t===`table_open`}function mc(e){if(e[0]?.type!==`blockquote_open`)return null;let t=e[1],n=e[2]?.children;if(t?.type!==`paragraph_open`||!n?.length)return null;let r=n[0],i=r?.type===`text`?ic.exec(r.content):null;return i?.[1]?(n.shift(),n[0]?.type===`softbreak`&&n.shift(),n.length===0&&e.splice(1,3),i[1].toLowerCase()):null}function hc(e){let t=lc(uc(e)),n=t?.length===1?t[0]:void 0;if(n?.type!==`image`)return null;let r=X.utils.escapeHtml,i=r(String(n.attrGet(`src`)??``)),a=r(n.content),o=String(n.attrGet(`title`)??``);return`<figure class="doc-figure"><a href="${i}" target="_blank" rel="noopener noreferrer" aria-label="${a===``?`Open image full size`:`${a} (opens full size)`}"><img src="${i}" alt="${a}"></a>`+(o?`<figcaption>${r(o)}</figcaption>`:``)+`</figure>`}function Q(e){return e.groups[e.index]}function $(e){return e[0]}function gc(e){let t=e?.[0];return t?.type===`fence`&&t.info.trim()===`mermaid`}var _c=e=>{let t=Q(e),n=$(t);if(n.type!==`heading_open`)return null;let r=t[1],i=Zs(r),a=e.slugify(i);return e.index===e.pageHeadingIndex?{blocks:[],pageHeadingId:a}:{blocks:[{kind:`heading`,level:Math.min(Math.max(Number(n.tag.slice(1)),2),6),id:a,html:Z(X.renderer.renderInline(r?.children??[],X.options,e.environment)),text:i}]}},vc=e=>{let t=Q(e);if(!gc(t))return null;let n=yc(e.groups[e.index-1]),r=e.groups[e.index+1],i=e.groups[e.index+2],a=r!==void 0&&i!==void 0&&fc(r)&&pc(i);return{blocks:[{kind:`diagram`,source:$(t).content.trimEnd(),caption:n?.replace(ac,``)??``,textHtml:a?Z(cc(i,e.environment)):``}],consumedGroups:a?2:0}};function yc(e){if(!e)return null;let t=dc(e);return t!==null&&ac.test(t)?t:null}var bc=[_c,vc,e=>{let t=$(Q(e));return t.type===`fence`?{blocks:[{kind:`code`,language:t.info.trim().split(/\s+/)[0]??``,code:t.content.replace(/\n$/,``)}]}:null},e=>{let t=Q(e);return $(t).type===`table_open`?{blocks:[{kind:`table`,html:Z(cc(t,e.environment)),label:`${e.nearestHeadingText} table`.trim()}]}:null},e=>{let t=Q(e),n=mc(t);return n===null?null:{blocks:[{kind:`callout`,variant:n,html:Z(cc(t.slice(1,-1),e.environment))}]}},e=>{let t=hc(Q(e));return t===null?null:{blocks:[{kind:`html`,html:Z(t)}]}},e=>yc(Q(e))===null?null:gc(e.groups[e.index+1])?{blocks:[]}:null,e=>{let t=Z(cc(Q(e),e.environment));return{blocks:t.trim()===``?[]:[{kind:`html`,html:t}]}}];function xc(e){let t=[];for(let n of e){let e=t[t.length-1];n.kind===`html`&&e?.kind===`html`?t[t.length-1]={kind:`html`,html:e.html+n.html}:t.push(n)}return t}function Sc(e){return e.flatMap(e=>e.kind===`heading`&&(e.level===2||e.level===3)?[{id:e.id,level:e.level,text:e.text}]:[])}function Cc(e,t){let n=sc(X.parse(e,t)),r=Xs(),i=n.findIndex(e=>$(e).type===`heading_open`&&$(e).tag===`h1`),a=[],o=``,s=Zs(n[i]?.[1]);for(let e=0;e<n.length;e+=1){let c={groups:n,index:e,environment:t,slugify:r,pageHeadingIndex:i,nearestHeadingText:s};for(let t of bc){let n=t(c);if(n===null)continue;a.push(...n.blocks),o=n.pageHeadingId??o,e+=n.consumedGroups??0;let r=n.blocks.find(e=>e.kind===`heading`);r?.kind===`heading`&&(s=r.text);break}}let c=xc(a);return{headingId:o,blocks:c,outline:Sc(c)}}var wc={key:0,class:`doc-sidebar`,"aria-label":`Documentation navigation`},Tc={class:`doc-sidebar__search`},Ec={class:`doc-column`},Dc={class:`doc-topbar`},Oc={class:`doc-content__header`},kc={class:`doc-content__body`},Ac={class:`doc-content__toc`},jc=k(t({__name:`DocsPage`,setup(e){let t=me(),{closeDocs:d}=tt(),{library:m,pagePath:g,page:_,activeGroup:y,query:x,searchActive:w,hashId:ee,setQuery:te}=Gr(),D=nc(m,p(()=>w.value?x.value:``));Kr(D.outcome,w);let ne=p(()=>!w.value&&_.value===void 0),O=p(()=>{let e=_.value;return e?Cc(e.markdown,{file:e.file,pageUrl:e.url,library:m,imageUrls:Hr}):null}),re=p(()=>_.value?.url??`/doc/`),ie=p(()=>bn(m,g.value)),ae=p(()=>w.value?`SEARCH RESULTS`:_.value?_.value.title:`PAGE NOT FOUND`),oe=p(()=>w.value?`Search results`:_.value?_.value.title:`Page not found`),se=p(()=>{let e=_.value;return w.value||!e?[{label:`Docs`,to:`/doc/`},{label:w.value?`Search`:`Page not found`}]:[{label:e.groupTitle,to:y.value?.pages[0]?.url??`/doc/`},{label:e.title}]});rc(oe);let ce=i(null),k=i(null),le=i(null),ue=i(null),de=i(null),fe=i(!1);dn(p(()=>`${g.value}|${w.value}`),ee,ne,{scrollRegions:p(()=>[k.value,le.value]),findPageHeading:()=>ce.value?.querySelector(`h1`)??null,findAnchorTarget:e=>{let t=document.getElementById(e);return t&&ce.value?.contains(t)?t:null}}),r(g,()=>{fe.value=!1});function pe(e){let t=e.target;t instanceof HTMLElement&&t.closest(`input, textarea, select, [contenteditable]`)||e.defaultPrevented||d()}return v(()=>t.setActive(!0)),C(()=>t.setActive(!1)),(e,r)=>(b(),S(`div`,{ref_key:`rootRef`,ref:ce,class:`doc-page theme-light light-island`,"data-testid":`docs-page`,onKeydown:n(pe,[`esc`])},[u(t).sidebarOpen?(b(),a(ut,{key:0,groups:u(m).groups,"active-group-key":u(y)?.key},null,8,[`groups`,`active-group-key`])):c(``,!0),s(`div`,{ref_key:`bodyRef`,ref:k,class:E([`doc-body`,{"doc-body--no-sidebar":!u(t).sidebarOpen}])},[u(t).sidebarOpen?(b(),S(`aside`,wc,[s(`div`,Tc,[l(gt,{ref_key:`searchFieldRef`,ref:ue,"model-value":u(x),"onUpdate:modelValue":u(te),onFocusResults:r[0]||=e=>de.value?.focusFirst()},null,8,[`model-value`,`onUpdate:modelValue`])]),l(at,{open:fe.value,"onUpdate:open":r[1]||=e=>fe.value=e,label:`Pages in ${u(y)?.title??`Docs`}`,"collapse-below":`tablet`},{default:T(()=>[l(Bt,{group:u(y)??u(m).groups[0],"current-path":u(g)},null,8,[`group`,`current-path`])]),_:1},8,[`open`,`label`])])):c(``,!0),s(`div`,Ec,[s(`div`,Dc,[l(et,{trail:se.value},null,8,[`trail`]),l(nt)]),s(`div`,{ref_key:`mainRef`,ref:le,class:`doc-main`},[s(`div`,{class:E([`doc-content`,{"doc-content--page":O.value&&!u(w)}])},[s(`div`,Oc,[l(ft,{id:u(w)?void 0:O.value?.headingId},{default:T(()=>[h(f(ae.value),1)]),_:1},8,[`id`])]),u(w)?(b(),a(un,{key:0,ref_key:`searchResultsRef`,ref:de,class:`doc-content__body`,query:u(x),outcome:u(D).outcome.value,library:u(m),onFocusField:r[2]||=e=>ue.value?.focus()},null,8,[`query`,`outcome`,`library`])):O.value?(b(),S(o,{key:2},[s(`div`,kc,[(b(),a(Ze,{key:u(_)?.url,blocks:O.value.blocks},null,8,[`blocks`])),l(Gt,{previous:ie.value.previous,next:ie.value.next},null,8,[`previous`,`next`])]),s(`div`,Ac,[l(St,{entries:O.value.outline,"page-url":re.value},null,8,[`entries`,`page-url`])])],64)):(b(),a(vt,{key:1,class:`doc-content__body`,"requested-path":u(g),onSearch:u(te)},null,8,[`requested-path`,`onSearch`]))],2)],512)])],2),l(mt)],544))}}),[[`__scopeId`,`data-v-60e78821`]]);export{jc as default};