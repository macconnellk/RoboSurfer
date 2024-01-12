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
