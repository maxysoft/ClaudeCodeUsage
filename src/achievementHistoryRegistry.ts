import {ACHIEVEMENT_DEFINITIONS,ACHIEVEMENT_SERIES} from './achievements';
import {achievementRuleVersion} from './achievementRuleVersions';
import {LONG_TERM_ACHIEVEMENT_DEFINITIONS} from './achievementLongTerm';
import {API_ACHIEVEMENT_DEFINITIONS} from './achievementMoneyCatalog';

export const HISTORY_REGISTRY_VERSION=1;
export interface HistoryRuleShape {target:number;group:string;ruleVersion:number;series:string|null;baseId:string|null;scope:string|null}
export interface HistoryRegistration extends HistoryRuleShape {id:string;counter:string}
// achievementHistoryDates handles exactly these counters for v1 rules. Adding one dates every
// catalog rule it counts; src/test/achievementHistoryRegistry.test.ts pins the resulting list.
const HISTORY_COUNTERS=new Set(['sonnet-main','opus-cannon','haiku-worker','cache-wizard','claude-output',
 'claude-output-sessions','claude-cache-creation','fable-volume','fable-days','fable-relay','fable-sessions',
 'weekly-volume','astra-regular','sol-regular','luna-regular','active-day-streak','active-days','cumulative-volume',
 'codex-output','codex-cache-read','astra-days','sol-days','luna-days','sonnet-days','opus-days','haiku-days',
 'dual-provider-days','active-weeks','weekly-average','three-family-day',
 'claude-api-total','claude-api-week','codex-api-total','codex-api-week']);
const COUNTER_OVERRIDES:Readonly<Record<string,string>>={'streak-machine':'active-day-streak','dual-provider-day':'dual-provider-days'};
const seriesFor=new Map(Object.entries(ACHIEVEMENT_SERIES).flatMap(([name,ids])=>ids.map(id=>[id,name] as const)));
const shapes=new Map(ACHIEVEMENT_DEFINITIONS.map(r=>[r.id,{target:r.target,group:r.group,ruleVersion:achievementRuleVersion(r.id),
 series:seriesFor.get(r.id)??null,baseId:LONG_TERM_ACHIEVEMENT_DEFINITIONS.find(x=>x.id===r.id)?.baseId??null,
 scope:API_ACHIEVEMENT_DEFINITIONS.find(x=>x.id===r.id)?.scope??null}]));
export const HISTORY_DATE_REGISTRATIONS:readonly Readonly<HistoryRegistration>[]=Object.freeze([...shapes]
 .map(([id,shape]):HistoryRegistration=>({id,counter:COUNTER_OVERRIDES[id]??shape.series??id,...shape}))
 .filter(row=>row.ruleVersion===1&&HISTORY_COUNTERS.has(row.counter)).map(row=>Object.freeze(row)));
const registered=new Map(HISTORY_DATE_REGISTRATIONS.map(r=>[r.id,r]));
export function historyRegistrationAllows(id:string,counter:string):boolean {
 return registered.get(id)?.counter===counter;
}
export const ACHIEVEMENT_HISTORY_CATALOG_SIGNATURE=JSON.stringify({algorithm:1,registry:HISTORY_REGISTRY_VERSION,
 actual:[...shapes],registered:HISTORY_DATE_REGISTRATIONS});
