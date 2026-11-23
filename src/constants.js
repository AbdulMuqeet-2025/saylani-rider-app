export const LOGO="/logo.png";
export const fmt=n=>"PKR "+(+n||0).toLocaleString("en-US");
export const now=()=>new Date().toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
export const today=()=>new Date().toISOString().slice(0,10);
export const rid=p=>p+"-"+Array.from({length:16},()=>"0123456789ABCDEF"[Math.random()*16|0]).join("");
export const RIDER={id:"RID-004",name:"Shameer",email:"shahmeer@gmail.com",phone:"+923001234567",city:"Karachi",zone:"Karachi · SITE Area"};
export const AREAS={"DB-0002":"Shahrah-e-Faisal","DB-0001":"Jauhar Colony"};
export const STEPS=["Assigned","On the way","Arrived","Counting cash","Submitted"],COINS=[1,2,5,10],NOTES=[10,20,50,100,500,1000,5000];

