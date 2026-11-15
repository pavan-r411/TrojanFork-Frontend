// Explicit demo adapter. Never imported to recover from a production API failure.
import { nutrients, total } from './nutrition.js';
const days = new Map();
export function daily(date) {
  if (!days.has(date)) days.set(date, {date, targets:{calories:2200,protein_g:130,carbs_g:250,fat_g:70}, consumed:{calories:0,protein_g:0,carbs_g:0,fat_g:0}, planned:{calories:0,protein_g:0,carbs_g:0,fat_g:0}, planned_spending_cents:0, actual_spending_cents:0, logs:[]});
  return structuredClone(days.get(date));
}
function save(data) {
  data.consumed = Object.fromEntries(nutrients.map(key=>[key,total(data.logs.map(x=>x.nutrition),key)]));
  data.actual_spending_cents = total(data.logs,'price_cents');
  days.set(data.date,data); return structuredClone(data);
}
export function log(body,item) {
  const data=daily(body.date);
  if(data.logs.some(x=>x.recommendation_id===item.id && x.slot===body.slot)) return data;
  data.logs.push({id:body.idempotency_key,recommendation_id:item.id,slot:body.slot,meal_title:item.meal_title,portion:body.portion,serving_size:item.nutrition.serving_size || null,quality:item.nutrition.status,price_cents:item.price_cents===null?null:Math.round(item.price_cents*body.portion),nutrition:Object.fromEntries(nutrients.map(key=>[key,typeof item.nutrition[key]==='number'?item.nutrition[key]*body.portion:null]))});
  return save(data);
}
export function remove(date,id) { const data=daily(date);data.logs=data.logs.filter(x=>x.id!==id);return save(data); }
export function demoPlan(mode,date) {
  const titles = {breakfast:['Greek yogurt & berries','Egg and avocado toast','Peanut butter oats'],lunch:['Grilled chicken rice bowl','Tofu vegetable bowl','Turkey sandwich'],dinner:['Salmon and roasted potatoes','Lentil curry with rice','Chicken pesto pasta'],snack:['Apple and almond butter','Cottage cheese and fruit','Hummus and pita']};
  return {plan_id:`demo_${mode}`,mode,date,generated_at:new Date().toISOString(),summary:{total_cost_cents:2850,remaining_budget_cents:1350,swipes_used:0,remaining_swipes:3,nutrition:{calories:1680,protein_g:105,coverage:'demo estimates'}},warnings:['Demo recommendations and nutrition estimates. Not live menu data.'],slots:Object.entries(titles).map(([slot,names])=>({slot,optional:slot==='snack',locked:false,selected_recommendation_id:null,recommendations:names.map((name,index)=>({id:`demo_${mode}_${slot}_${index}`,rank:index+1,meal_title:name,item_ids:[],venue:{id:'demo',name:mode==='usc_dining'?'Demo campus dining':'Demo nearby kitchen',type:mode==='usc_dining'?'dining_hall':'restaurant'},cuisine:null,image_url:null,dietary_tags:[],price_cents:950+index*100,payment_label:'Demo price',walking_meters:320,walking_minutes:5,nutrition:{calories:slot==='snack'?220:480+index*80,protein_g:slot==='snack'?12:30+index*4,carbs_g:slot==='snack'?24:55+index*5,fat_g:slot==='snack'?9:16+index*3,serving_size:'1 bowl / plate',status:'estimated'},allergen_information_status:'unknown',source:{url:'',menu_date:date,verified_at:null,status:'needs_verification'},reason:'Demo option to preview meal planning and nutrition tracking.'}))}))};
}

const selectedPlans = new Map();
export function updatePlan(plan) {
  selectedPlans.set(`${plan.date}:${plan.mode}`, plan);
  const items = [...selectedPlans.values()].filter(p=>p.date===plan.date).flatMap(p=>p.slots.flatMap(s=>s.recommendations.filter(r=>r.id===s.selected_recommendation_id)));
  const data = daily(plan.date);
  data.planned = Object.fromEntries(nutrients.map(key=>[key,total(items.map(x=>x.nutrition),key)]));
  data.planned_spending_cents = total(items,'price_cents');
  days.set(plan.date,data);
}
