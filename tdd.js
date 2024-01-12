function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

var pumpData = 0;
    var logtdd = "";
    var logBasal = "";
    var logBolus = "";
    var logTempBasal = "";
    var dataLog = "";
    var logOutPut = "";
    var current = 0;
    var tdd = 0;
    var insulin = 0;
    var tempInsulin = 0;
    var bolusInsulin = 0;
    var scheduledBasalInsulin = 0;
    var quota = 0;
    const weightedAverage = oref2_variables.weightedAverage;
    var overrideFactor = 1;
    var sensitivity = profile.sens;
    var carbRatio = profile.carb_ratio;
    if (oref2_variables.useOverride) {
        overrideFactor = oref2_variables.overridePercentage / 100;
        if (isfAndCr) {
            sensitivity /= overrideFactor;
            carbRatio /= overrideFactor;
        } else {
            if (cr_) { carbRatio /= overrideFactor; }
            if (isf) { sensitivity /= overrideFactor; }
        }   
    }
    const weightPercentage = profile.weightPercentage;
    const average_total_data = oref2_variables.average_total_data;
    
    function addTimeToDate(objDate, _hours) {
        var ms = objDate.getTime();
        var add_ms = _hours * 36e5;
        var newDateObj = new Date(ms + add_ms);
        return newDateObj;
    }
      
    function subtractTimeFromDate(date, hours_) {
        var ms_ = date.getTime();
        var add_ms_ = hours_ * 36e5;
        var new_date = new Date(ms_ - add_ms_);
        return new_date;
    }
    
    function accountForIncrements(insulin) {
        // If you have not set this to.0.1 in iAPS settings, this will be set to 0.05 (Omnipods) in code.
        var minimalDose = profile.bolus_increment;
        if (minimalDose != 0.1) {
            minimalDose = 0.05;
        }
        var incrementsRaw = insulin / minimalDose;
        if (incrementsRaw >= 1) {
            var incrementsRounded = Math.floor(incrementsRaw);
            return round(incrementsRounded * minimalDose, 5);
        } else { return 0; }
    }

    function makeBaseString(base_timeStamp) {
        function addZero(i) {
            if (i < 10) { i = "0" + i }
            return i;
        }
        let hour = addZero(base_timeStamp.getHours());
        let minutes = addZero(base_timeStamp.getMinutes());
        let seconds = "00";
        let string = hour + ":" + minutes + ":" + seconds;
        return string;
    }
       
    function timeDifferenceOfString(string1, string2) {
        //Base time strings are in "00:00:00" format
        var time1 = new Date("1/1/1999 " + string1);
        var time2 = new Date("1/1/1999 " + string2);
        var ms1 = time1.getTime();
        var ms2 = time2.getTime();
        var difference = (ms1 - ms2) / 36e5;
        return difference;
    }

    function calcScheduledBasalInsulin(lastRealTempTime, addedLastTempTime) {
        var totalInsulin = 0;
        var old = addedLastTempTime;
        var totalDuration = (lastRealTempTime - addedLastTempTime) / 36e5;
        var basDuration = 0;
        var totalDurationCheck = totalDuration;
        var durationCurrentSchedule = 0;
        
        do {

            if (totalDuration > 0) {
                
                var baseTime_ = makeBaseString(old);
                
                //Default basalrate in case none is found...
                var basalScheduledRate_ = basalprofile[0].rate;
                for (let m = 0; m < basalprofile.length; m++) {
                    
                    var timeToTest = basalprofile[m].start;
                    
                    if (baseTime_ == timeToTest) {
                        
                        if (m + 1 < basalprofile.length) {
                            let end = basalprofile[m+1].start;
                            let start = basalprofile[m].start;
                                                        
                            durationCurrentSchedule = timeDifferenceOfString(end, start);
                            
                            if (totalDuration >= durationCurrentSchedule) {
                                basDuration = durationCurrentSchedule;
                            } else if (totalDuration < durationCurrentSchedule) {
                                basDuration = totalDuration;
                            }
                            
                        }
                        else if (m + 1 == basalprofile.length) {
                            let end = basalprofile[0].start;
                            let start = basalprofile[m].start;
                            // First schedule is 00:00:00. Changed places of start and end here.
                            durationCurrentSchedule = 24 - (timeDifferenceOfString(start, end));
                            
                            if (totalDuration >= durationCurrentSchedule) {
                                basDuration = durationCurrentSchedule;
                            } else if (totalDuration < durationCurrentSchedule) {
                                basDuration = totalDuration;
                            }
                        
                        }
                        basalScheduledRate_ = basalprofile[m].rate;
                        totalInsulin += accountForIncrements(basalScheduledRate_ * basDuration);
                        totalDuration -= basDuration;
                        console.log("Dynamic ratios log: scheduled insulin added: " + accountForIncrements(basalScheduledRate_ * basDuration) + " U. Bas duration: " + basDuration.toPrecision(3) + " h. Base Rate: " + basalScheduledRate_ + " U/h" + ". Time :" + baseTime_);
                        // Move clock to new date
                        old = addTimeToDate(old, basDuration);
                    }
                    
                    else if (baseTime_ > timeToTest) {

                        if (m + 1 < basalprofile.length) {
                            var timeToTest2 = basalprofile[m+1].start
                         
                            if (baseTime_ < timeToTest2) {
                                
                               //  durationCurrentSchedule = timeDifferenceOfString(end, start);
                               durationCurrentSchedule = timeDifferenceOfString(timeToTest2, baseTime_);
                            
                                if (totalDuration >= durationCurrentSchedule) {
                                    basDuration = durationCurrentSchedule;
                                } else if (totalDuration < durationCurrentSchedule) {
                                    basDuration = totalDuration;
                                }
                                 
                                basalScheduledRate_ = basalprofile[m].rate;
                                totalInsulin += accountForIncrements(basalScheduledRate_ * basDuration);
                                totalDuration -= basDuration;
                                console.log("Dynamic ratios log: scheduled insulin added: " + accountForIncrements(basalScheduledRate_ * basDuration) + " U. Bas duration: " + basDuration.toPrecision(3) + " h. Base Rate: " + basalScheduledRate_ + " U/h" + ". Time :" + baseTime_);
                                // Move clock to new date
                                old = addTimeToDate(old, basDuration);
                            }
                        }
                    
                        else if (m == basalprofile.length - 1) {
                            // let start = basalprofile[m].start;
                            let start = baseTime_;
                            // First schedule is 00:00:00. Changed places of start and end here.
                            durationCurrentSchedule = timeDifferenceOfString("23:59:59", start);
                            
                            if (totalDuration >= durationCurrentSchedule) {
                                basDuration = durationCurrentSchedule;
                            } else if (totalDuration < durationCurrentSchedule) {
                                basDuration = totalDuration;
                            }
                            
                            basalScheduledRate_ = basalprofile[m].rate;
                            totalInsulin += accountForIncrements(basalScheduledRate_ * basDuration);
                            totalDuration -= basDuration;
                            console.log("Dynamic ratios log: scheduled insulin added: " + accountForIncrements(basalScheduledRate_ * basDuration) + " U. Bas duration: " + basDuration.toPrecision(3) + " h. Base Rate: " + basalScheduledRate_ + " U/h" + ". Time :" + baseTime_);
                            // Move clock to new date
                            old = addTimeToDate(old, basDuration);
                        }
                    }
                }
            }
            //totalDurationCheck to avoid infinite loop
        } while (totalDuration > 0 && totalDuration < totalDurationCheck);
        
        // amount of insulin according to pump basal rate schedules
        return totalInsulin;
      
      / Check that there is enough pump history data (>21 hours) for tdd calculation. Estimate the missing hours (24-pumpData) using hours with scheduled basal rates. Not perfect, but sometimes the
    // pump history in FAX is only 22-23.5 hours, even when you've been looping with FAX for many days. This is to reduce the error from just using pump history as data source as much as possible.
    // AT basal rates are not used for this estimation, instead the basal rates in pump settings.
    
    // Check for empty pump history (new FAX loopers). If empty: don't use dynamic settings!
   
    if (!pumphistory.length) { 
        console.log("Pumphistory is empty!");
        dynISFenabled = false;
        enableDynamicCR = false;
    } else {
        let phLastEntry = pumphistory.length - 1;
        var endDate = new Date(pumphistory[phLastEntry].timestamp);
        var startDate = new Date(pumphistory[0].timestamp);
        
        // If latest pump event is a temp basal
        if (pumphistory[0]._type == "TempBasalDuration") {
            startDate = new Date();
        }
        pumpData = (startDate - endDate) / 36e5;
        
        if (pumpData < 23.9 && pumpData > 21) {
            var missingHours = 24 - pumpData;
            // Makes new end date for a total time duration of exakt 24 hour.
            var endDate_ = subtractTimeFromDate(endDate, missingHours);
            // endDate - endDate_ = missingHours
            scheduledBasalInsulin = calcScheduledBasalInsulin(endDate, endDate_);
            dataLog = "24 hours of data is required for an accurate tdd calculation. Currently only " + pumpData.toPrecision(3) + " hours of pump history data are available. Using your pump scheduled basals to fill in the missing hours. Scheduled basals added: " + scheduledBasalInsulin.toPrecision(5) + " U. ";
        } else if (pumpData < 21) { 
            dynISFenabled = false;
            enableDynamicCR = false;
        } else {  dataLog = ""; }
    }
    
    // Calculate tdd ----------------------------------------------------------------------
    
    //Bolus:
    for (let i = 0; i < pumphistory.length; i++) {
        if (pumphistory[i]._type == "Bolus") {
            bolusInsulin += pumphistory[i].amount;
        }
    }
    
    // Temp basals:
    for (let j = 1; j < pumphistory.length; j++) {
        if (pumphistory[j]._type == "TempBasal" && pumphistory[j].rate > 0) {
            current = j;
            quota = pumphistory[j].rate;      
            var duration = pumphistory[j-1]['duration (min)'] / 60;
            var origDur = duration;
            var pastTime = new Date(pumphistory[j-1].timestamp);
            var morePresentTime = pastTime;
            var substractTimeOfRewind = 0;
            // If temp basal hasn't yet ended, use now as end date for calculation
            do {
                j--;
                if (j == 0) {
                    morePresentTime =  new Date();
                    break;
                } 
                else if (pumphistory[j]._type == "TempBasal" || pumphistory[j]._type == "PumpSuspend")  {
                    morePresentTime = new Date(pumphistory[j].timestamp);
                    break;
                }
                // During the time the Medtronic pumps are rewinded and primed, this duration of suspened insulin delivery needs to be accounted for. 
                var pp = j-2;
                if (pp >= 0) {
                    if (pumphistory[pp]._type == "Rewind") {
                        let rewindTimestamp = pumphistory[pp].timestamp;
                        // There can be several Prime events
                        while (pp - 1 >= 0) {
                            pp -= 1;
                            if (pumphistory[pp]._type == "Prime") {
                                substractTimeOfRewind = (pumphistory[pp].timestamp - rewindTimestamp) / 36e5;
                            } else { break }
                        }
                    
                        // If Medtronic user forgets to insert infusion set
                        if (substractTimeOfRewind >= duration) {
                            morePresentTime = rewindTimestamp;
                            substractTimeOfRewind = 0;
                        }
                    }
                }
            }
            while (j > 0);
            
            var diff = (morePresentTime - pastTime) / 36e5;
            if (diff < origDur) {
                duration = diff;
            }

            insulin = quota * (duration - substractTimeOfRewind);
            tempInsulin += accountForIncrements(insulin);
            j = current;
        }
    }
    //  Check and count for when basals are delivered with a scheduled basal rate.
    //  1. Check for 0 temp basals with 0 min duration. This is for when ending a manual temp basal and (perhaps) continuing in open loop for a while.
    //  2. Check for temp basals that completes. This is for when disconnected from link/iphone, or when in open loop.
    //  3. Account for a punp suspension. This is for when pod screams or when MDT or pod is manually suspended.
    //  4. Account for a pump resume (in case pump/cgm is disconnected before next loop).
    //  To do: are there more circumstances when scheduled basal rates are used? Do we need to care about "Prime" and "Rewind" with MDT pumps?
    //
    for (let k = 0; k < pumphistory.length; k++) {
        // Check for 0 temp basals with 0 min duration.
        insulin = 0;
        if (pumphistory[k]['duration (min)'] == 0 || pumphistory[k]._type == "PumpResume") {
            let time1 = new Date(pumphistory[k].timestamp);
            let time2 = time1;
            let l = k;
            do {  
                if (l > 0) {
                    --l;
                    if (pumphistory[l]._type == "TempBasal") {
                        time2 = new Date(pumphistory[l].timestamp);
                        break;
                    }
                }
            } while (l > 0);
            // duration of current scheduled basal in h
            let basDuration = (time2 - time1) / 36e5;
           
            if (basDuration > 0) {
                scheduledBasalInsulin += calcScheduledBasalInsulin(time2, time1);
            }
        }
    }
    
    // Check for temp basals that completes
    for (let n = pumphistory.length -1; n > 0; n--) {
        if (pumphistory[n]._type == "TempBasalDuration") {
            // duration in hours
            let oldBasalDuration = pumphistory[n]['duration (min)'] / 60;
            // time of old temp basal
            let oldTime = new Date(pumphistory[n].timestamp);                  
            var newTime = oldTime;
            let o = n;
            do {
                --o;
                if (o >= 0) {
                    if (pumphistory[o]._type == "TempBasal" || pumphistory[o]._type == "PumpSuspend") {
                        // time of next (new) temp basal or a pump suspension
                        newTime = new Date(pumphistory[o].timestamp);
                        break;
                    }
                }
            } while (o > 0);
            
            // When latest temp basal is index 0 in pump history
            if (n == 0 && pumphistory[0]._type == "TempBasalDuration") {
                newTime = new Date();
                oldBasalDuration = pumphistory[n]['duration (min)'] / 60;
            }
            
            let tempBasalTimeDifference = (newTime - oldTime) / 36e5;
            let timeOfbasal = tempBasalTimeDifference - oldBasalDuration;          
            // if duration of scheduled basal is more than 0
            if (timeOfbasal > 0) {
                // Timestamp after completed temp basal
                let timeOfScheduledBasal =  addTimeToDate(oldTime, oldBasalDuration);
                scheduledBasalInsulin += calcScheduledBasalInsulin(newTime, timeOfScheduledBasal);
            }
        }
    }

    tdd = bolusInsulin + tempInsulin + scheduledBasalInsulin;
    
    var insulin_ = {
        TDD: round(tdd, 5),
        bolus: round(bolusInsulin, 5),
        temp_basal: round(tempInsulin, 5),
        scheduled_basal: round(scheduledBasalInsulin, 5)
    }
    var tdd_before = tdd;
    
    if (pumpData > 21) {
        logBolus = ". Bolus insulin: " + bolusInsulin.toPrecision(5) + " U";
        logTempBasal = ". Temporary basal insulin: " + tempInsulin.toPrecision(5) + " U";
        logBasal = ". Insulin with scheduled basal rate: " + scheduledBasalInsulin.toPrecision(5) + " U";  
        logtdd = " TDD past 24h is: " + tdd.toPrecision(5) + " U"; 
        logOutPut = dataLog + logtdd + logBolus + logTempBasal + logBasal;




        tddReason = ", TDD: " + round(tdd,2) + " U, " + round(bolusInsulin/tdd*100,0) + "% Bolus " + round((tempInsulin+scheduledBasalInsulin)/tdd*100,0) +  "% Basal";
    
    } else { tddReason = ", TDD: Not enough pumpData (< 21h)"; }

    // --------
