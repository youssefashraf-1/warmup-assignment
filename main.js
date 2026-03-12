const fs = require("fs");

// ====================== Helper Functions ======================

// Convert hh:mm:ss am/pm to seconds
function timeStringToSeconds(timeStr) {
    const [time, modifier] = timeStr.trim().split(' ');
    let [hours, minutes, seconds] = time.split(':').map(Number);
    if (modifier.toLowerCase() === 'pm' && hours !== 12) hours += 12;
    if (modifier.toLowerCase() === 'am' && hours === 12) hours = 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Convert seconds to h:mm:ss
function secondsToHMS(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// ====================== Functions ============================

// Function 1
function getShiftDuration(startTime, endTime) {
    let durationSec = timeStringToSeconds(endTime) - timeStringToSeconds(startTime);
    if (durationSec < 0) durationSec += 24 * 3600; // overnight shift
    return secondsToHMS(durationSec);
}

// Function 2
function getIdleTime(startTime, endTime) {
    const deliveryStart = timeStringToSeconds("8:00:00 am");
    const deliveryEnd = timeStringToSeconds("10:00:00 pm");
    let startSec = timeStringToSeconds(startTime);
    let endSec = timeStringToSeconds(endTime);
    let idle = 0;
    if (startSec < deliveryStart) idle += Math.min(endSec, deliveryStart) - startSec;
    if (endSec > deliveryEnd) idle += endSec - Math.max(startSec, deliveryEnd);
    return secondsToHMS(Math.max(idle, 0));
}

// Function 3
function getActiveTime(shiftDuration, idleTime) {
    const parseHMS = str => str.split(':').map(Number);
    const shiftSec = parseHMS(shiftDuration).reduce((a,b,i)=>a*60+b,0);
    const idleSec = parseHMS(idleTime).reduce((a,b,i)=>a*60+b,0);
    return secondsToHMS(Math.max(shiftSec - idleSec, 0));
}

// Function 4
function metQuota(date, activeTime) {
    const current = new Date(date);
    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");
    const quotaSec = (current >= eidStart && current <= eidEnd) ? 6*3600 : 8*3600 + 24*60;
    const [h,m,s] = activeTime.split(':').map(Number);
    const activeSec = h*3600 + m*60 + s;
    return activeSec >= quotaSec;
}

// Function 5
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;
    let data = fs.existsSync(textFile) ? fs.readFileSync(textFile, "utf-8") : "";
    let lines = data.trim() ? data.split("\n") : [];

    for (let line of lines) {
        const [id, , entryDate] = line.split(",");
        if (id === driverID && entryDate === date) return {};
    }

    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quotaMet = metQuota(date, activeTime);

    const newRecord = { driverID, driverName, date, startTime, endTime, shiftDuration, idleTime, activeTime, metQuota: quotaMet, hasBonus: false };
    const newLine = [driverID, driverName, date, startTime, endTime, shiftDuration, idleTime, activeTime, quotaMet, false].join(",");

    let insertIndex = lines.length;
    for (let i=lines.length-1; i>=0; i--) if (lines[i].split(",")[0] === driverID) { insertIndex = i+1; break; }
    lines.splice(insertIndex, 0, newLine);
    fs.writeFileSync(textFile, lines.join("\n"));
    return newRecord;
}

// Function 6
function setBonus(textFile, driverID, date, newValue) {
    const data = fs.readFileSync(textFile, "utf-8");
    let lines = data.split("\n");
    lines = lines.map(line => {
        const parts = line.split(",");
        if (parts[0] === driverID && parts[2] === date) parts[9] = newValue.toString();
        return parts.join(",");
    });
    fs.writeFileSync(textFile, lines.join("\n"));
}

// Function 7
function countBonusPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return -1;
    const lines = fs.readFileSync(textFile,"utf-8").trim().split("\n");
    if (!lines.length) return -1;
    let foundDriver=false, count=0;
    for (let line of lines) {
        const parts=line.split(","), id=parts[0], date=parts[2], hasBonus=parts[9]==="true";
        if(id===driverID){foundDriver=true; if(parseInt(date.split("-")[1],10)===parseInt(month,10)&&hasBonus) count++;}
    }
    return foundDriver?count:-1;
}

// Function 8
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if(!fs.existsSync(textFile)) return "0:00:00";
    const lines=fs.readFileSync(textFile,"utf-8").trim().split("\n");
    let totalSec=0;
    for(let line of lines){
        const parts=line.split(","), id=parts[0], date=parts[2], activeTime=parts[7];
        if(id===driverID && parseInt(date.split("-")[1],10)===parseInt(month,10)){
            const [h,m,s]=activeTime.split(":").map(Number);
            totalSec+=h*3600+m*60+s;
        }
    }
    return secondsToHMS(totalSec);
}

// Function 9
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month){
    if(!fs.existsSync(textFile)||!fs.existsSync(rateFile)) return "0:00:00";
    const shiftData=fs.readFileSync(textFile,"utf-8").trim();
    const rateData=fs.readFileSync(rateFile,"utf-8").trim();
    if(!shiftData||!rateData) return "0:00:00";

    const rates=rateData.split("\n");
    let dayOff="";
    for(let line of rates){
        const [id, off]=line.split(",");
        if(id===driverID){dayOff=off; break;}
    }
    if(!dayOff) return "0:00:00";

    const shifts=shiftData.split("\n");
    let totalSec=0;
    for(let line of shifts){
        const parts=line.split(","), id=parts[0], date=parts[2];
        if(id===driverID && parseInt(date.split("-")[1],10)===month){
            const dayName=new Date(date).toLocaleDateString("en-US",{weekday:"long"});
            if(dayName!==dayOff){
                const quota=(date>="2025-04-10" && date<="2025-04-30")?6*3600:8*3600+24*60;
                totalSec+=quota;
            }
        }
    }
    totalSec-=bonusCount*2*3600;
    if(totalSec<0) totalSec=0;
    return secondsToHMS(totalSec);
}

// Function 10
function getNetPay(driverID, actualHours, requiredHours, rateFile){
    if(!fs.existsSync(rateFile)) return 0;
    const rateData=fs.readFileSync(rateFile,"utf-8").trim();
    if(!rateData) return 0;
    let basePay=0, tier=0;
    for(let line of rateData.split("\n")){
        const [id, , base, t]=line.split(",");
        if(id===driverID){basePay=parseInt(base,10); tier=parseInt(t,10); break;}
    }
    if(!basePay) return 0;
    const allowed=[0,50,20,10,3][tier];
    const parseTime=str=>str.split(":").map(Number).reduce((a,b)=>a*60+b,0);
    const missingSec=parseTime(requiredHours)-parseTime(actualHours);
    if(missingSec<=0) return basePay;
    const remainingSec=missingSec-allowed*3600;
    if(remainingSec<=0) return basePay;
    const missingHours=Math.floor(remainingSec/3600);
    return basePay - missingHours*Math.floor(basePay/185);
}

module.exports={
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};