import Charts
import CoreData
import SwiftUI
import Swinject

extension Bolus {
    struct AlternativeBolusCalcRootView: BaseView {
        let resolver: Resolver
        let waitForSuggestion: Bool
        let fetch: Bool
        @EnvironmentObject var state: StateModel
        @State private var showInfo = false
        @State private var exceededMaxBolus = false
        @State private var keepForNextWiew: Bool = false
        @State private var remoteBolusAlert: Alert?
        @State private var isRemoteBolusAlertPresented: Bool = false
        @State private var guardExpanded = false

        private enum Config {
            static let dividerHeight: CGFloat = 2
            static let overlayColour: Color = .white // Currently commented out
            static let spacing: CGFloat = 3
        }

        @Environment(\.colorScheme) var colorScheme
        @FocusState private var isFocused: Bool

        let meal: FetchedResults<Meals>
        let mealEntries: any View

        init(
            resolver: Resolver,
            waitForSuggestion: Bool,
            fetch: Bool,
//            state: StateModel,
            meal: FetchedResults<Meals>,
            mealEntries: any View
        ) {
            self.resolver = resolver
            self.waitForSuggestion = waitForSuggestion
            self.fetch = fetch
//            self.state = state
            self.meal = meal
            self.mealEntries = mealEntries
        }

        private var formatter: NumberFormatter {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.maximumFractionDigits = 2
            return formatter
        }

        private var mealFormatter: NumberFormatter {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.maximumFractionDigits = 1
            return formatter
        }

        private var gluoseFormatter: NumberFormatter {
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            if state.units == .mmolL {
                formatter.maximumFractionDigits = 1
            } else { formatter.maximumFractionDigits = 0 }
            return formatter
        }

        private var fractionDigits: Int {
            if state.units == .mmolL {
                return 1
            } else { return 0 }
        }

        /// Whole-percent reduction applied by the falling glucose guard. Reported as an
        /// integer so the row can be suppressed when the reduction rounds below one percent,
        /// which would otherwise render as "0%".
        private var guardReductionPercent: Int {
            NSDecimalNumber(decimal: (1 - state.trendGuardScale) * 100).intValue
        }

        var body: some View {
            Form {
                Section {
                    if state.waitForSuggestion {
                        Text("Please wait")
                    } else if state.predictions != nil {
                        predictionChart
                    } else {
                        Text("No Predictions. Failed loop suggestion.").frame(maxWidth: .infinity, alignment: .center)
                    }
                }

                if state.predictions == nil || state.currentBG == 0 {
                    if state.currentBG == 0 {
                        Section {
                            HStack {
                                Text("Glucose")
                                Spacer()
                                BGTextField(
                                    "0",
                                    mgdlValue: $state.manualGlucose,
                                    units: $state.units,
                                    isDisabled: false,
                                    liveEditing: true
                                )
                            }.onChange(of: state.manualGlucose) {
                                state.insulinCalculated = state.calculateInsulin()
                            }
                        } header: { Text("New Glucose Missing") }
                    }
                }

                Section {}
                if fetch {
                    Section { mealEntries.asAny() }
                }

                Section {
                    if !state.waitForSuggestion {
                        HStack {
                            Button(action: {
                                showInfo.toggle()
                            }, label: {
                                Image(systemName: "info.bubble")
                                    .symbolRenderingMode(.palette)
                                    .foregroundStyle(colorScheme == .light ? .black : .white, .blue)
                                    .font(.infoSymbolFont)
                                Text("Calculations")
                            })
                                .foregroundStyle(.blue)
                                .font(.footnote)
                                .buttonStyle(PlainButtonStyle())
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if state.fattyMeals {
                                Spacer()
                                Toggle(isOn: $state.useFattyMealCorrectionFactor) {
                                    Text("High GI Meal")
                                }
                                .toggleStyle(CheckboxToggleStyle())
                                .font(.footnote)
                                .onChange(of: state.useFattyMealCorrectionFactor) {
                                    state.insulinCalculated = state.calculateInsulin()
                                }
                            }
                        }
                    }

                    if state.waitForSuggestion {
                        HStack {
                            Text("Wait please").foregroundColor(.secondary)
                            Spacer()
                            ActivityIndicator(isAnimating: .constant(true), style: .medium) // fix iOS 15 bug
                        }
                    } else {
                        HStack {
                            Text("Insulin recommended")
                            Spacer()
                            Text(
                                formatter
                                    .string(from: Double(state.insulinCalculated) as NSNumber) ?? ""
                            )
                            Text(
                                NSLocalizedString(" U", comment: "Unit in number of units delivered (keep the space character!)")
                            ).foregroundColor(.secondary)
                        }.contentShape(Rectangle())
                            .onTapGesture { state.amount = state.insulinCalculated }
                    }

                    HStack {
                        Text("Bolus")
                        Spacer()
                        DecimalTextField(
                            "0",
                            value: $state.amount,
                            formatter: formatter,
                            liveEditing: true
                        )
                        Text(exceededMaxBolus ? "😵" : " U").foregroundColor(.secondary)
                    }
                    .focused($isFocused)
                    .onChange(of: state.amount) {
                        if state.amount > state.maxBolus {
                            exceededMaxBolus = true
                        } else {
                            exceededMaxBolus = false
                        }
                    }
                }

                if state.amount > 0 {
                    Section {
                        Button {
                            if let remoteBolus = state.remoteBolus() {
                                remoteBolusAlert = Alert(
                                    title: Text("A Remote Bolus Was Just Delivered!"),
                                    message: Text(remoteBolus),
                                    primaryButton: .destructive(Text("Bolus"), action: {
                                        keepForNextWiew = true
                                        state.add()
                                    }),
                                    secondaryButton: .cancel()
                                )
                                isRemoteBolusAlertPresented = true
                            } else {
                                keepForNextWiew = true
                                state.add()
                            }
                        }
                        label: { Text(exceededMaxBolus ? "Max Bolus exceeded!" : "Enact bolus") }
                            .frame(maxWidth: .infinity, alignment: .center)
                            .disabled(disabled)
                            .listRowBackground(!disabled ? Color(.systemBlue) : Color(.systemGray4))
                            .tint(.white)
                    }
                    footer: {
                        if (-1 * state.loopDate.timeIntervalSinceNow / 60) > state.loopReminder, let string = state.lastLoop() {
                            Text(NSLocalizedString(string, comment: "Bolus View footer"))
                                .padding(.top, 20).multilineTextAlignment(.center)
                                .foregroundStyle(.orange)
                        }
                    }
                }

                if state.amount <= 0 {
                    Section {
                        Button {
                            keepForNextWiew = true
                            state.save()
                            state.showModal(for: nil)
                            if state.currentBG == 0, state.manualGlucose != 0 {
                                state.addManualGlucose()
                            }
                        }
                        label: {
                            fetch ?
                                Text("Save Meal without bolus") :
                                Text("Continue without bolus")
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .listRowBackground(Color(.systemBlue))
                        .tint(.white)
                    }
                    footer: {
                        if (-1 * state.loopDate.timeIntervalSinceNow / 60) > state.loopReminder, let string = state.lastLoop() {
                            Text(NSLocalizedString(string, comment: "Bolus View footer"))
                                .padding(.top, 20).multilineTextAlignment(.center)
                                .foregroundStyle(.orange)
                        }
                    }
                }

                Section {
                    // Outside the disclosure: when the guard acts you see it without expanding.
                    if state.trendGuardEnabled, guardReductionPercent >= 1 {
                        HStack {
                            Text("Reduced for falling glucose")
                            Spacer()
                            Text("\(guardReductionPercent)%")
                        }
                        .font(.footnote)
                        .foregroundStyle(.orange)
                    }

                    DisclosureGroup(isExpanded: $guardExpanded) {
                        Toggle(isOn: $state.trendGuardEnabled) {
                            Text("Reduce dose for falling glucose")
                        }
                        .onChange(of: state.trendGuardEnabled) {
                            state.insulinCalculated = state.calculateInsulin()
                        }

                        HStack {
                            Text("Delta weight")
                            Spacer()
                            DecimalTextField("1.5", value: $state.trendGuardDeltaWeight, formatter: formatter)
                        }
                        HStack {
                            Text("Minimum dose fraction")
                            Spacer()
                            DecimalTextField("0.75", value: $state.trendGuardFloor, formatter: formatter)
                        }
                    } label: {
                        // The OFF marker stays on the collapsed label so a disabled guard
                        // cannot be silently forgotten.
                        HStack {
                            Text("Falling Glucose Guard")
                            if !state.trendGuardEnabled {
                                Spacer()
                                Text("OFF").foregroundStyle(.orange)
                            }
                        }
                    }
                    .onChange(of: state.trendGuardDeltaWeight) {
                        state.insulinCalculated = state.calculateInsulin()
                    }
                    .onChange(of: state.trendGuardFloor) {
                        state.insulinCalculated = state.calculateInsulin()
                    }
                }
            }
            .interactiveDismissDisabled()
            .compactSectionSpacing()
            .alert(isPresented: $isRemoteBolusAlertPresented) {
                remoteBolusAlert!
            }
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            .navigationTitle("Enact Bolus")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button {
                    keepForNextWiew = state.carbsView(fetch: fetch, hasFatOrProtein: hasFatOrProtein, mealSummary: meal)
                }
                label: {
                    HStack {
                        Image(systemName: "chevron.backward")
                        Text("Meal")
                    }
                },
                trailing: Button {
                    state.hideModal()
                    state.notActive()
                    if fetch { state.apsManager.determineBasalSync() }
                }
                label: { Text("Cancel") }
            )
            .onAppear {
                state.viewActive()
                state.waitForCarbs = fetch
                state.waitForSuggestionInitial = waitForSuggestion
                state.waitForSuggestion = waitForSuggestion
                state.insulinCalculated = state.calculateInsulin()
                state.start()
            }
            .popup(isPresented: showInfo, alignment: .bottom, direction: .center, type: .default) {
                illustrationView()
            }
        }

        var predictionChart: some View {
            ZStack {
                PredictionView(
                    predictions: $state.predictions, units: $state.units, eventualBG: $state.evBG,
                    useEventualBG: $state.eventualBG, target: $state.target,
                    displayPredictions: $state.displayPredictions, currentGlucose: $state.currentBG
                )
            }
        }

        private var disabled: Bool {
            state.amount <= 0 || state.amount > state.maxBolus || state.amount <
                state.minBolus || state.amount < state.bolusIncrement
        }

        var changed: Bool {
            !unchanged
        }

        private var unchanged: Bool {
            guard let meal = meal.first else { return true }

            let hasMicros = (meal.micronutrient as? Set<Micronutrient>)?.contains { ($0.amount?.decimalValue ?? 0) > 0 } ?? false

            return (meal.carbs?.decimalValue ?? 0) <= 0 &&
                (meal.fat?.decimalValue ?? 0) <= 0 &&
                (meal.protein?.decimalValue ?? 0) <= 0 &&
                (meal.fiber?.decimalValue ?? 0) <= 0 &&
                !hasMicros
        }

        var hasFatOrProtein: Bool {
            guard let meal = meal.first else { return false }
            return ((meal.fat ?? 0) != 0) || ((meal.protein ?? 0) != 0)
        }

        func carbsView() {
            if fetch {
                keepForNextWiew = true
                state.backToCarbsView(override: false, editMode: true)
            } else {
                state.backToCarbsView(override: true, editMode: false)
            }
        }

        private func illustrationView() -> some View {
            VStack {
                IllustrationView(data: $state.data)
                // Hide button
                VStack {
                    Button { showInfo = false }
                    label: { Text("Hide") }.frame(maxWidth: .infinity, alignment: .center)
                        .tint(.blue)
                }.padding(.bottom, 20)
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color(colorScheme == .dark ? UIColor.systemGray4 : UIColor.systemGray5))
            )
        }
    }
}
