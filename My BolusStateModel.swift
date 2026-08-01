import Foundation
import LoopKit
import SwiftUI
import Swinject

extension Bolus {
    final class StateModel: BaseStateModel<Provider> {
        @Injected() var unlockmanager: UnlockManager!
        @Injected() var deviceManager: DeviceDataManager!
        @Injected() var apsManager: APSManager!
        @Injected() var broadcaster: Broadcaster!
        // added for bolus calculator
        @Injected() var settings: SettingsManager!
        @Injected() var announcementStorage: AnnouncementsStorage!
        @Injected() var carbsStorage: CarbsStorage!

        @Published var suggestion: Suggestion?
        @Published var predictions: Predictions?
        @Published var amount: Decimal = 0
        @Published var insulinRecommended: Decimal = 0
        @Published var insulinRequired: Decimal = 0
        @Published var units: GlucoseUnits = .mmolL
        @Published var percentage: Decimal = 0
        @Published var threshold: Decimal = 0
        @Published var maxBolus: Decimal = 0
        @Published var errorString: String = ""
        @Published var evBG: Decimal = 0
        @Published var insulin: Decimal = 0
        @Published var isf: Decimal = 0
        @Published var error: Bool = false
        @Published var minPredBG: Decimal = 0
        @Published var minDelta: Decimal = 0
        @Published var expectedDelta: Decimal = 0
        @Published var waitForSuggestion: Bool = false
        @Published var carbRatio: Decimal = 0

        var waitForSuggestionInitial: Bool = false
        @Published var waitForCarbs: Bool = false

        // added for bolus calculator
        @Published var recentGlucose: BloodGlucose?
        @Published var target: Decimal = 100
        @Published var cob: Decimal = 0
        @Published var iob: Decimal = 0

        @Published var currentBG: Decimal = 0
        @Published var manualGlucose: Decimal = 0
        @Published var fifteenMinInsulin: Decimal = 0
        @Published var deltaBG: Decimal = 0
        @Published var targetDifferenceInsulin: Decimal = 0
        @Published var wholeCobInsulin: Decimal = 0
        @Published var iobInsulinReduction: Decimal = 0
        @Published var wholeCalc: Decimal = 0
        @Published var insulinCalculated: Decimal = 0
        @Published var roundedInsulinCalculated: Decimal = 0
        @Published var fraction: Decimal = 0
        @Published var useCalc: Bool = true
        @Published var fattyMeals: Bool = false
        @Published var fattyMealFactor: Decimal = 0
        @Published var useFattyMealCorrectionFactor: Bool = false
        @Published var displayPredictions: Bool = true

        @Published var meal: [CarbsEntry]?
        @Published var carbs: Decimal = 0
        @Published var fat: Decimal = 0
        @Published var protein: Decimal = 0
        @Published var note: String = ""
        @Published var data = [InsulinRequired(agent: "Something", amount: 0)]
        @Published var eventualBG: Bool = false
        @Published var minimumPrediction: Bool = false
        @Published var closedLoop: Bool = false
        @Published var loopDate: Date = .distantFuture
        @Published var now = Date.now
        @Published var bolus: Decimal = 0
        @Published var carbToStore = [CarbsEntry]()
        @Published var history: [PumpHistoryEvent]?
        @Published var disable15MinTrend: Bool = false
        @Published var minBolus: Decimal = 0.05

        // MARK: Falling glucose guard

        @Published var trendGuardEnabled: Bool = true {
            didSet { UserDefaults.standard.set(trendGuardEnabled, forKey: GuardKeys.enabled) }
        }

        @Published var trendGuardDeltaWeight: Decimal = 1.5 {
            didSet {
                UserDefaults.standard.set(
                    Double(truncating: trendGuardDeltaWeight as NSDecimalNumber),
                    forKey: GuardKeys.deltaWeight
                )
            }
        }

        @Published var trendGuardFloor: Decimal = 0.75 {
            didSet {
                UserDefaults.standard.set(
                    Double(truncating: trendGuardFloor as NSDecimalNumber),
                    forKey: GuardKeys.floor
                )
            }
        }

        /// Multiplier produced by the most recent calculation. 1 when the guard did not engage.
        @Published var trendGuardScale: Decimal = 1

        private enum GuardKeys {
            static let enabled = "trendGuardEnabled"
            static let deltaWeight = "trendGuardDeltaWeight"
            static let floor = "trendGuardFloor"
        }

        /// Clamped at point of use rather than on write, so whatever is left in a settings
        /// field cannot produce a multiplier outside a safe range.
        private var guardDeltaWeight: Decimal { max(min(trendGuardDeltaWeight, 4), 0) }
        private var guardFloor: Decimal { max(min(trendGuardFloor, 1), 0.5) }

        var concentration: (concentration: Double, increment: Double) {
            CoreDataStorage().insulinConcentration()
        }

        let bolusIncrement: Decimal = 0.05
        let loopReminder: CGFloat = 4
        let oldGlucose: TimeInterval = -15
        let coreDataStorage = CoreDataStorage()

        private var loopFormatter: NumberFormatter {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.maximumFractionDigits = 0
            return formatter
        }

        private let processQueue = DispatchQueue(label: "setupBolusData.processQueue")

        override func subscribe() {
            broadcaster.register(SuggestionObserver.self, observer: self)
            units = settingsManager.settings.units
            minimumPrediction = settingsManager.settings.minumimPrediction
            threshold = settingsManager.preferences.threshold_setting
            maxBolus = provider.pumpSettings().maxBolus
            fraction = settings.settings.overrideFactor
            useCalc = settings.settings.useCalc
            fattyMeals = settings.settings.fattyMeals
            fattyMealFactor = settings.settings.fattyMealFactor
            eventualBG = settings.settings.eventualBG
            displayPredictions = settings.settings.displayPredictions
            closedLoop = settings.settings.closedLoop
            loopDate = apsManager.lastLoopDate
            disable15MinTrend = settings.settings.disable15MinTrend
            minBolus = Decimal(deviceManager.pumpManager?.supportedBolusVolumes.first ?? Double(bolusIncrement)) *
                Decimal(concentration.concentration)

            let guardDefaults = UserDefaults.standard
            // object(forKey:) rather than bool(forKey:) — a missing key returns false, which
            // would silently start a safety guard disabled on first launch after deploy.
            if guardDefaults.object(forKey: GuardKeys.enabled) != nil {
                trendGuardEnabled = guardDefaults.bool(forKey: GuardKeys.enabled)
            }
            if let weight = guardDefaults.object(forKey: GuardKeys.deltaWeight) as? Double {
                trendGuardDeltaWeight = Decimal(weight)
            }
            if let floorValue = guardDefaults.object(forKey: GuardKeys.floor) as? Double {
                trendGuardFloor = Decimal(floorValue)
            }
        }

        func start() {
            if waitForSuggestionInitial {
                if waitForCarbs {
                    setupBolusData()
                } else {
                    apsManager.determineBasal()
                        .receive(on: DispatchQueue.main)
                        .sink { [weak self] ok in
                            guard let self = self else { return }
                            if !ok {
                                self.waitForSuggestion = false
                                self.insulinRequired = 0
                                self.insulinRecommended = 0
                            } else if let notNilSugguestion = provider.suggestion {
                                suggestion = notNilSugguestion
                                if let notNilPredictions = suggestion?.predictions {
                                    predictions = notNilPredictions
                                }
                            }

                        }.store(in: &lifetime)
                    setupPumpData()
                    loopDate = apsManager.lastLoopDate
                }
            }
            setupInsulinRequired()
        }

        func getDeltaBG() {
            let glucose = provider.fetchGlucose()
            guard let lastGlucose = glucose.first else { return }
            guard (lastGlucose.date ?? .distantPast).timeIntervalSinceNow.minutes > oldGlucose else {
                currentBG = 0
                print("BG time ago: \((lastGlucose.date ?? .distantPast).timeIntervalSinceNow.minutes)")
                return
            }
            currentBG = Decimal(lastGlucose.glucose) * conversion
            guard glucose.count >= 4 else { return }
            deltaBG = Decimal(lastGlucose.glucose + glucose[1].glucose) / 2 -
                (Decimal(glucose[3].glucose + glucose[2].glucose) / 2)
        }

        func calculateInsulin() -> Decimal {
            // The actual glucose threshold
            threshold = max(target - 0.5 * (target - 40 * conversion), threshold * conversion)
            // Use either the eventual glucose prediction or just the Swift code
            if eventualBG {
                if evBG > target {
                    // Use Oref0 predictions{
                    insulin = (evBG - target) / isf
                } else { insulin = 0 }
            } else if manualGlucose > 0 {
                let targetDifference = (units == .mmolL ? manualGlucose.asMmolL : manualGlucose) - target
                targetDifferenceInsulin = isf == 0 ? 0 : targetDifference / isf
            } else if currentBG > 0 {
                let targetDifference = currentBG - target
                print("BG: \(currentBG), target: \(target), isf: \(isf)")
                targetDifferenceInsulin = isf == 0 ? 0 : targetDifference / isf
            } else {
                targetDifferenceInsulin = 0
                print("BG: \(currentBG), target: \(target), isf: \(isf)")
            }

            // more or less insulin because of bg trend in the last 15 minutes
            fifteenMinInsulin = (isf == 0 || disable15MinTrend) ? 0 : (deltaBG * conversion) / isf
            print("fifteenMinInsulin isf: \(isf), deltaBG: \(deltaBG * conversion)")

            // determine whole COB for which we want to dose insulin for and then determine insulin for wholeCOB
            // If failed recent suggestion use recent carb entry
            wholeCobInsulin = carbRatio != 0 ? max(cob, recentCarbs) / carbRatio : 0

            // determine how much the calculator reduces/ increases the bolus because of IOB
            // If failed recent suggestion use recent IOB value
            iobInsulinReduction = (-1) * max(iob, recentIOB)

            // Gross requirement: the insulin this meal and this glucose state call for,
            // before any pacing and before crediting insulin already delivered.
            let grossRequirement: Decimal
            if deltaBG != 0 {
                grossRequirement = targetDifferenceInsulin + wholeCobInsulin + fifteenMinInsulin
            } else if currentBG == 0, manualGlucose == 0 {
                grossRequirement = wholeCobInsulin
            } else {
                grossRequirement = targetDifferenceInsulin + wholeCobInsulin
            }

            // Net requirement, unpaced. Retained with its previous meaning for display and
            // for any consumer of this published property. Not the value that is dosed.
            wholeCalc = grossRequirement + iobInsulinReduction

            if eventualBG {
                // Oref0 eventual-glucose path. `insulin` is already a net figure derived
                // from the prediction rather than from COB, so pacing applies to it
                // directly and there is no separate IOB term to credit.
                let result = insulin * fraction
                insulinCalculated = useFattyMealCorrectionFactor ? result * fattyMealFactor : result
            } else {
                // Pacing applies to the gross requirement only. Insulin already delivered is
                // credited in full, because it is on board at 100% and not at the pacing
                // percentage.
                //
                // overrideFactor deliberately withholds part of the requirement so the loop
                // can deliver it as SMBs over the following 60-90 minutes. That withheld
                // insulin is, by construction, a gap between COB and IOB. Scaling the whole
                // expression by the pacing factor scales the IOB term with it, so only
                // `fraction` of the insulin on board is credited back and the remaining
                // (1 - fraction) x IOB is re-offered as a new dose. Reopening the calculator
                // while a meal is still absorbing therefore re-doses insulin that has
                // already been delivered, and does so again on every subsequent opening.
                //
                // Pacing the gross requirement and subtracting IOB at full value preserves
                // the intent of overrideFactor - deliver `fraction` of what the meal calls
                // for and let SMBs complete it - while making the result a function of what
                // is outstanding rather than of how many times the calculator was opened.
                //
                // The fatty meal / High GI factor multiplies the same gross requirement, so
                // a factor equal to 1 / overrideFactor continues to mean "deliver the full
                // requirement upfront". That path is unaffected by this change: when the
                // product of the two factors is 1, there is no withheld portion to re-offer.
                var pacedRequirement = grossRequirement * fraction
                if useFattyMealCorrectionFactor {
                    pacedRequirement *= fattyMealFactor
                }
                insulinCalculated = pacedRequirement + iobInsulinReduction
            }

            // Applied to the final recommendation rather than to any single component,
            // because the carb term dominates at a large ISF and scaling anything smaller
            // has no practical effect.
            trendGuardScale = fallingGlucoseScale()
            if trendGuardScale < 1 {
                insulinCalculated *= trendGuardScale
            }

            // A blend of Oref0 predictions and the Swift calculator {
            if minimumPrediction, minPredBG < threshold {
                if eventualBG { insulin = 0 }
                return 0
            }

            // Account for increments (Don't use the apsManager function as that is much too slow)
            insulinCalculated = roundBolus(insulinCalculated)
            // 0 up to maxBolus
            insulinCalculated = min(max(insulinCalculated, 0), maxBolus)

            prepareData()
            return insulinCalculated
        }

        /// Multiplier applied when glucose is falling and already near target.
        ///
        /// The calculator's glucose and trend terms enter additively through ISF, so at a
        /// large ISF they cannot meaningfully influence a carb-driven dose — at ISF 210 a
        /// glucose of 90 against a target of 115 contributes about -0.12U. A multiplier can.
        ///
        /// The taper runs from `target` (no reduction) down to `curveBase` (maximum
        /// reduction) along a smoothstep curve. `curveBase` sits below `threshold`
        /// deliberately: anchoring the curve at threshold places a projection of 85 near the
        /// steep end of the taper, which treats it as nearly as dangerous as a projection of
        /// 78. Extending the span keeps mild and moderate falls near full dose while still
        /// reaching the floor when the projection genuinely heads below threshold.
        ///
        /// The level gate keeps the guard from engaging on a fast fall from a high glucose,
        /// which is usually a high-glucose event or sensor noise rather than hypo risk.
        ///
        /// `deltaGate` applies two different principles either side of `target - 15`.
        ///
        /// Above it, a fall must be steep enough to project below threshold before carbs
        /// act. Solving `BG + deltaWeight * deltaBG < threshold` gives -10 only below about
        /// 92.5, -15 below 100, -20 below 107.5. A deltaBG of -10 at BG 100 projects to 85,
        /// which is above threshold, and high-GI carbs lift glucose from 10-15 minutes while
        /// Fiasp does almost nothing in its first 15-20 — the nadir lands near 85-90 and
        /// turns up. There is no hypo there to guard against.
        ///
        /// At or below it, the margin for error is small enough that any real fall warrants
        /// a modest trim even where the projection stays above threshold. This produces a
        /// deliberate step at the boundary: a deltaBG of -10 gives full dose at BG 101 and
        /// about 87% at BG 99.
        ///
        /// `deltaBG` is the mean of the two most recent readings less the mean of the two
        /// before them, so it spans ten minutes: a deltaBG of -10 is a fall of about 5 per
        /// reading. It is stored in mg/dL, so `deltaGate` is compared against it unconverted
        /// while the projection applies `conversion` — the same treatment the
        /// fifteenMinInsulin term gives it.
        private func fallingGlucoseScale() -> Decimal {
            let deltaGate: Decimal = currentBG <= (target - 15 * conversion) ? 5 : 15
            guard trendGuardEnabled, deltaBG <= -deltaGate, currentBG > 0 else { return 1 }

            let levelGate = target + 25 * conversion
            guard currentBG <= levelGate else { return 1 }

            let curveBase = threshold - 20 * conversion
            let span = target - curveBase
            guard span > 0 else { return 1 }

            let projectedBG = currentBG + guardDeltaWeight * (deltaBG * conversion)
            var x = (projectedBG - curveBase) / span
            x = max(min(x, 1), 0)

            let curve = x * x * (3 - 2 * x)
            return guardFloor + (1 - guardFloor) * curve
        }

        /// When COB module fail
        var recentCarbs: Decimal {
            var temporaryCarbs: Decimal = 0
            guard let temporary = carbToStore.first else { return 0 }
            let timeDifference = (temporary.actualDate ?? .distantPast).timeIntervalSinceNow
            if timeDifference <= 0, timeDifference > -15.minutes.timeInterval {
                temporaryCarbs = temporary.carbs
            }
            return temporaryCarbs
        }

        /// When IOB module fail
        var recentIOB: Decimal {
            guard iob == 0 else { return 0 }
            guard let recent = coreDataStorage.recentReason() else { return 0 }
            let timeDifference = (recent.date ?? .distantPast).timeIntervalSinceNow
            if timeDifference <= 0, timeDifference > -30.minutes.timeInterval {
                let recent = ((recent.iob ?? 0) as Decimal)
                let pumpHistory = history?
                    .filter({ $0.timestamp.timeIntervalSinceNow > timeDifference && $0.type == .bolus })
                    .compactMap(\.amount).reduce(0, +) ?? 0
                return recent + pumpHistory
            } else if let history = history {
                let total = history
                    .filter({ $0.timestamp.timeIntervalSinceNow > -360.minutes.timeInterval && $0.type == .bolus })
                    .compactMap(\.amount).reduce(0, +)
                return max(total, 0)
            }
            return 0
        }

        func setupPumpData() {
            DispatchQueue.main.async {
                self.history = self.provider.pumpHistory()
            }
        }

        func add() {
            guard amount > 0 else {
                showModal(for: nil)
                return
            }

            let maxAmount = Double(min(amount, provider.pumpSettings().maxBolus))

            unlockmanager.unlock()
                .sink { _ in } receiveValue: { [weak self] _ in
                    guard let self = self else { return }
                    self.save()
                    self.apsManager.enactBolus(amount: maxAmount, isSMB: false)
                    self.showModal(for: nil)
                }
                .store(in: &lifetime)
        }

        func save() {
            guard !empty else { return }
            CoreDataStorage().updateLatestMeal(to: true)
            carbsStorage.storeCarbs(carbToStore)
        }

        func saveMeal() {
            if let recent = coreDataStorage.recentMeal() {
                carbToStore = [CarbsEntry(
                    id: recent.id,
                    createdAt: (recent.createdAt ?? Date.now).addingTimeInterval(5.seconds.timeInterval),
                    actualDate: recent.actualDate,
                    carbs: (recent.carbs ?? 0) as Decimal,
                    fat: (recent.fat ?? 0) as Decimal,
                    protein: (recent.protein ?? 0) as Decimal,
                    fiber: (recent.protein ?? 0) as Decimal,
                    note: recent.note,
                    enteredBy: CarbsEntry.manual,
                    isFPU: false,
                    micronutrient: recent.micronutrientValues
                )]
            }

            guard !empty else { return }
            carbsStorage.storeCarbs(carbToStore)
            CoreDataStorage().saveMeal(carbToStore, now: Date.now, savedToFile: true)
        }

        func setupInsulinRequired() {
            let conversion: Decimal = units == .mmolL ? 0.0555 : 1
            DispatchQueue.main.async {
                if let suggestion = self.suggestion {
                    self.insulinRequired = suggestion.insulinReq ?? 0
                    self.evBG = Decimal(suggestion.eventualBG ?? 0) * conversion
                    self.iob = suggestion.iob ?? 0
                    self.cob = suggestion.cob ?? 0
                }
                // Unwrap. We can't have NaN values.
                if let reasons = CoreDataStorage().fetchReason(), let target = reasons.target, let isf = reasons.isf,
                   let carbRatio = reasons.cr, let minPredBG = reasons.minPredBG
                {
                    self.target = target as Decimal
                    self.isf = isf as Decimal
                    self.carbRatio = carbRatio as Decimal

                    self.minPredBG = minPredBG as Decimal
                }

                if self.useCalc {
                    self.getDeltaBG()
                    self.insulinCalculated = self.roundBolus(max(self.calculateInsulin(), 0))
                    self.prepareData()
                }
            }
        }

        func backToCarbsView(override: Bool, editMode: Bool) {
            showModal(for: .addCarbs(editMode: editMode, override: override, mode: .meal))
        }

        func carbsView(fetch: Bool, hasFatOrProtein _: Bool, mealSummary _: FetchedResults<Meals>) -> Bool {
            var keepForNextWiew = false
            if fetch {
                keepForNextWiew = true
                backToCarbsView(override: false, editMode: true)
            } else {
                backToCarbsView(override: true, editMode: false)
            }
            return keepForNextWiew
        }

        func remoteBolus() -> String? {
            if let enactedAnnouncement = announcementStorage.recentEnacted() {
                let components = enactedAnnouncement.notes.split(separator: ":")
                guard components.count == 2 else { return nil }
                let command = String(components[0]).lowercased()
                let eventual: String = units == .mmolL ? evBG.asMmolL
                    .formatted(.number.grouping(.never).rounded().precision(.fractionLength(1))) : evBG.formatted()

                if command == "bolus" {
                    return "\n" + NSLocalizedString("A Remote Bolus ", comment: "Remote Bolus Alert, part 1") +
                        NSLocalizedString("was delivered", comment: "Remote Bolus Alert, part 2") + (
                            -1 * enactedAnnouncement.createdAt
                                .timeIntervalSinceNow
                                .minutes
                        )
                        .formatted(.number.grouping(.never).rounded().precision(.fractionLength(0))) +
                        NSLocalizedString(
                            " minutes ago, triggered remotely from Nightscout, by a caregiver or a parent. Do you still want to bolus?\n\nPredicted eventual glucose, if you don't bolus, is: ",
                            comment: "Remote Bolus Alert, part 3"
                        ) + eventual + " " + units.rawValue
                }
            }
            return nil
        }

        func notActive() {
            let defaults = UserDefaults.standard
            defaults.set(false, forKey: IAPSconfig.inBolusView)
            // print("Active: NO") // For testing
        }

        func viewActive() {
            let defaults = UserDefaults.standard
            defaults.set(true, forKey: IAPSconfig.inBolusView)
            // print("Active: YES") // For testing
        }

        var conversion: Decimal {
            units == .mmolL ? 0.0555 : 1
        }

        func addManualGlucose() {
            let glucose = manualGlucose
            let now = Date()
            let id = UUID().uuidString

            let saveToJSON = BloodGlucose(
                _id: id,
                sgv: Int(glucose),
                date: Decimal(now.timeIntervalSince1970) * 1000,
                dateString: now,
                unfiltered: glucose,
                uncalibrated: glucose,
                glucose: Int(glucose),
                type: GlucoseType.manual.rawValue
            )
            provider.glucoseStorage.storeGlucose([saveToJSON])
            debug(.default, "Manual Glucose saved to glucose.json")
            // Save to Health
            var saveToHealth = [BloodGlucose]()
            saveToHealth.append(saveToJSON)
        }

        private func prepareData() {
            if !eventualBG {
                var prepareData = !disable15MinTrend ? [
                    InsulinRequired(agent: NSLocalizedString("Carbs", comment: ""), amount: wholeCobInsulin),
                    InsulinRequired(agent: NSLocalizedString("IOB", comment: ""), amount: iobInsulinReduction),
                    InsulinRequired(agent: NSLocalizedString("Glucose", comment: ""), amount: targetDifferenceInsulin),
                    InsulinRequired(agent: NSLocalizedString("Trend", comment: ""), amount: fifteenMinInsulin),
                    InsulinRequired(agent: NSLocalizedString("Factors", comment: ""), amount: 0),
                    InsulinRequired(agent: NSLocalizedString("Amount", comment: ""), amount: insulinCalculated)
                ] :
                    [
                        InsulinRequired(agent: NSLocalizedString("Carbs", comment: ""), amount: wholeCobInsulin),
                        InsulinRequired(agent: NSLocalizedString("IOB", comment: ""), amount: iobInsulinReduction),
                        InsulinRequired(agent: NSLocalizedString("Glucose", comment: ""), amount: targetDifferenceInsulin),
                        InsulinRequired(agent: NSLocalizedString("Factors", comment: ""), amount: 0),
                        InsulinRequired(agent: NSLocalizedString("Amount", comment: ""), amount: insulinCalculated)
                    ]
                let total = prepareData.dropLast().map(\.amount).reduce(0, +)
                if total > 0 {
                    let factor = -1 * (total - insulinCalculated)
                    prepareData[!disable15MinTrend ? 4 : 3]
                        .amount = abs(factor) >= minBolus ? factor : 0
                }
                data = prepareData
            }
        }

        func lastLoop() -> String? {
            guard closedLoop else { return nil }
            guard abs(now.timeIntervalSinceNow / 60) > loopReminder else { return nil }
            let minAgo = abs(loopDate.timeIntervalSinceNow / 60)

            let stringAgo = loopFormatter.string(from: minAgo as NSNumber) ?? ""
            return "Last loop \(stringAgo) minutes ago. Complete or cancel this meal/bolus transaction to allow for next loop cycle to run"
        }

        private func roundBolus(_ amount: Decimal) -> Decimal {
            // Account for increments (don't use the APSManager function as that gets too slow)
            let increment = minBolus
            return Decimal(round(Double(amount / increment))) * increment
        }

        func setupBolusData() {
            if let recent = coreDataStorage.recentMeal() {
                carbToStore = [CarbsEntry(
                    id: recent.id,
                    createdAt: (recent.createdAt ?? Date.now).addingTimeInterval(5.seconds.timeInterval),
                    actualDate: recent.actualDate,
                    carbs: (recent.carbs ?? 0) as Decimal,
                    fat: (recent.fat ?? 0) as Decimal,
                    protein: (recent.protein ?? 0) as Decimal,
                    fiber: (recent.fiber ?? 0) as Decimal,
                    note: recent.note,
                    enteredBy: CarbsEntry.manual,
                    isFPU: false,
                    micronutrient: recent.micronutrientValues
                )]

                // To Do: remove debug
                print("Meal Flow 2: retrieving from CoreData")
                for a in carbToStore {
                    guard let b = a.micronutrient else { continue }
                    for c in b {
                        print("Meal Flow 2: Micros: " + c.name + " " + c.formattedAmount)
                    }
                }

                if let passForward = carbToStore.first {
                    apsManager.temporaryData = TemporaryData(forBolusView: passForward)
                    apsManager.determineBasal()
                        .receive(on: DispatchQueue.main)
                        .sink { [weak self] ok in
                            guard let self = self else { return }
                            if !ok {
                                self.waitForSuggestion = false
                                self.waitForCarbs = false
                                self.insulinRequired = 0
                                self.insulinRecommended = 0
                            } else if let notNilSugguestion = provider.suggestion {
                                suggestion = notNilSugguestion
                                if let notNilPredictions = suggestion?.predictions {
                                    predictions = notNilPredictions
                                }
                            }

                        }.store(in: &lifetime)
                    setupPumpData()
                    loopDate = apsManager.lastLoopDate
                }
            }
        }

        private var empty: Bool {
            (carbToStore.first?.carbs ?? 0) == 0 && (carbToStore.first?.fat ?? 0) == 0 && (carbToStore.first?.protein ?? 0) ==
                0 && (carbToStore.first?.fiber ?? 0) == 0 &&
                ((carbToStore.first?.micronutrient?.first(where: { $0.amount != 0 })) != nil)
        }
    }
}

extension Bolus.StateModel: SuggestionObserver {
    func suggestionDidUpdate(_: Suggestion) {
        DispatchQueue.main.async {
            self.waitForSuggestion = false
        }
        setupInsulinRequired()
        loopDate = apsManager.lastLoopDate

        if abs(now.timeIntervalSinceNow / 60) > loopReminder * 1.5 {
            hideModal()
            notActive()
            debug(.apsManager, "Force Closing Bolus View", printToConsole: true)
        }
    }
}

extension Decimal {
    /// Account for increments
    func roundBolusIncrements(increment: Double) -> Decimal {
        Decimal(round(Double(self) / increment)) * Decimal(increment)
    }
}
