import SwiftUI
import UIKit

struct RootView: View {
  @Environment(AppModel.self) private var model
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 0) {
      TabView(selection: tabBinding) {
      NavigationStack {
        TaskBoardView()
      }
      .tabItem { Label(L10n.t("today"), systemImage: "sun.max") }
      .tag(AppView.today)

      NavigationStack {
        TaskBoardView()
      }
      .tabItem { Label(L10n.t("inbox"), systemImage: "tray") }
      .badge(model.counts.inbox > 0 ? "\(model.counts.inbox)" : nil)
      .tag(AppView.inbox)

      NavigationStack {
        ProjectListView()
      }
      .tabItem { Label(L10n.t("projects"), systemImage: "folder") }
      .tag(AppView.all)

      NavigationStack {
        UpcomingView()
      }
      .tabItem { Label(L10n.t("upcoming"), systemImage: "calendar") }
      .tag(AppView.upcoming)
    }
    .tint(Color(red: 0.04, green: 0.52, blue: 1))
    .preferredColorScheme(.dark)
    .id(model.locale)
    .onChange(of: scenePhase) { _, phase in
      UrgentAlerts.foreground = phase == .active
      if phase == .active {
        model.pingNetwork()
        UrgentAlerts.syncIslandWhenReady(model.store)
      } else {
        UrgentAlerts.sync(model.store)
      }
    }
    .onAppear {
      UrgentAlerts.foreground = true
      model.pingNetwork()
    }
    .onChange(of: model.view) { _, _ in
      model.query = ""
      dismissKeyboard()
    }
    .sheet(isPresented: Binding(
      get: { model.pendingNext != nil },
      set: { if !$0 { model.skipNext() } }
    )) {
      NextPromptView()
        .presentationDetents([.medium, .large])
    }
    .sheet(item: $model.editingTask) { task in
      TaskEditSheet(task: task)
    }
    }
  }

  private var tabBinding: Binding<AppView> {
    Binding(
      get: {
        switch model.view {
        case .today, .inbox, .upcoming: return model.view
        default: return .all
        }
      },
      set: { next in
        model.view = next
        if next == .upcoming { model.ensureUpcomingDate() }
        else { model.syncChipsToView() }
      }
    )
  }
}

struct UpcomingView: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    VStack(spacing: 0) {
      WeekStrip()
      TaskBoardView()
    }
    .onAppear {
      model.view = .upcoming
      model.ensureUpcomingDate()
    }
  }
}

struct WeekStrip: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    let days = Dates.weekDays(from: model.weekAnchor)
    let marked = Selectors.dueDates(model.store)
    HStack(spacing: 4) {
      shiftButton(-7, "chevron.left")
      ForEach(days, id: \.timeIntervalSince1970) { date in
        dayCell(date, marked: marked)
      }
      shiftButton(7, "chevron.right")
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 8)
    .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .padding(.horizontal, 12)
    .padding(.top, 8)
    .padding(.bottom, 4)
  }

  private func shiftButton(_ days: Int, _ icon: String) -> some View {
    Button {
      model.shiftWeek(days)
    } label: {
      Image(systemName: icon)
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(width: 22, height: 44)
    }
    .buttonStyle(.plain)
  }

  private func dayCell(_ date: Date, marked: Set<String>) -> some View {
    let value = Dates.iso(date)
    let selected = model.view == .upcoming && value == model.upcomingDate
    let has = marked.contains(value)
    return Button {
      model.selectDay(value)
    } label: {
      VStack(spacing: 3) {
        Text(Dates.weekdayShort(date))
          .font(.system(size: 10, weight: .semibold))
          .textCase(.uppercase)
        Text(Dates.dayNumber(date))
          .font(.system(size: 16, weight: .semibold))
          .monospacedDigit()
        Circle()
          .fill(has ? (selected ? Color.white : Color.accentColor) : Color.clear)
          .frame(width: 4, height: 4)
      }
      .foregroundStyle(selected ? Color.white : Color.secondary)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 8)
      .background(
        selected ? Color.accentColor.opacity(0.28) : Color.clear,
        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
      )
    }
    .buttonStyle(.plain)
  }
}

struct TaskBoardView: View {
  @Environment(AppModel.self) private var model
  @State private var showSearch = false

  var body: some View {
    @Bindable var model = model
    let header = model.header
    let groups = model.groups
    VStack(spacing: 0) {
      if showSearch {
        HStack {
          TextField(L10n.t("search"), text: $model.query)
            .textFieldStyle(.plain)
            .submitLabel(.search)
          Button(L10n.t("cancel")) {
            showSearch = false
            model.query = ""
            dismissKeyboard()
          }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
      }
      ComposerView()
      if groups.isEmpty {
        VStack(spacing: 8) {
          Text(model.empty.0).font(.title2.weight(.semibold))
          Text(model.empty.1)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { dismissKeyboard() }
      } else {
        List {
          ForEach(groups) { group in
            Section {
              ForEach(group.items) { task in
                TaskRow(task: task)
              }
            } header: {
              if group.title.isEmpty {
                EmptyView()
              } else {
                Text(group.title)
              }
            }
          }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .contentMargins(.bottom, 24, for: .scrollContent)
      }
    }
    .background(Color(red: 0.07, green: 0.07, blue: 0.08))
    .navigationTitle(header.title)
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        HStack(spacing: 12) {
          LanguageToggle()
          Button {
            showSearch.toggle()
            if !showSearch {
              model.query = ""
              dismissKeyboard()
            }
          } label: {
            Image(systemName: showSearch ? "xmark" : "magnifyingglass")
          }
          Button {
            dismissKeyboard()
            model.resync()
          } label: {
            Image(systemName: "arrow.triangle.2.circlepath")
          }
          .accessibilityLabel(model.syncStatus)
        }
      }
    }
    .overlay(alignment: .bottom) {
      if let toast = model.toast {
        Text(toast)
          .padding(.horizontal, 14)
          .padding(.vertical, 8)
          .background(.ultraThinMaterial, in: Capsule())
          .padding(.bottom, 12)
      }
    }
  }
}

struct ComposerView: View {
  @Environment(AppModel.self) private var model
  @State private var pickDate = false
  @State private var pickUrgent = false
  @FocusState private var composerFocused: Bool

  var body: some View {
    @Bindable var model = model
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        TextField(placeholder, text: $model.draft, axis: .vertical)
          .textFieldStyle(.plain)
          .lineLimit(1...4)
          .focused($composerFocused)
          .submitLabel(.done)
          .onSubmit {
            model.addDraft()
            composerFocused = false
          }
        Button(L10n.t("add")) {
          model.addDraft()
          composerFocused = false
          dismissKeyboard()
        }
          .disabled(model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      HStack(spacing: 8) {
        ForEach(chips, id: \.title) { item in
          chip(item.title, due: item.due)
        }
        Button {
          composerFocused = false
          dismissKeyboard()
          pickDate = true
        } label: {
          Image(systemName: "calendar")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.06), in: Capsule())
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
      }
      HStack(spacing: 8) {
        urgentChip(L10n.t("urgent30"), minutes: 30)
        urgentChip(L10n.t("urgent1h"), minutes: 60)
        urgentChip(L10n.t("urgent2h"), minutes: 120)
        Button(customUrgentTitle) {
          composerFocused = false
          dismissKeyboard()
          pickUrgent = true
        }
        .font(.caption)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(urgentIsCustom ? Color.orange.opacity(0.28) : Color.white.opacity(0.06), in: Capsule())
        .foregroundStyle(urgentIsCustom ? Color.orange : Color.secondary)
      }
      if model.urgentMinutes != nil {
        HStack(spacing: 8) {
          urgentAlertChip(L10n.t("urgentPush"), alert: "push")
          urgentAlertChip(L10n.t("urgentIsland"), alert: "island")
        }
        Text(L10n.t("urgentIslandHint"))
          .font(.caption2)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(12)
    .background(Color.white.opacity(0.04))
    .toolbar {
      ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button(L10n.t("doneKey")) {
          composerFocused = false
          dismissKeyboard()
        }
      }
    }
    .sheet(isPresented: $pickDate) {
      NavigationStack {
        DatePicker(L10n.t("date"), selection: dateBinding, displayedComponents: .date)
          .datePickerStyle(.graphical)
          .navigationTitle(L10n.t("dueDate"))
          .navigationBarTitleDisplayMode(.inline)
          .toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(L10n.t("noDate")) {
                model.chipDue = nil
                pickDate = false
              }
            }
            ToolbarItem(placement: .confirmationAction) {
              Button(L10n.t("ok")) { pickDate = false }
            }
          }
      }
      .presentationDetents([.medium, .large])
    }
    .sheet(isPresented: $pickUrgent) {
      UrgentDurationSheet()
        .presentationDetents([.medium])
    }
  }

  private var placeholder: String {
    switch model.view {
    case .today: return L10n.t("placeholderToday")
    case .inbox: return L10n.t("placeholderInbox")
    case .upcoming: return L10n.t("onDay", ["label": Dates.formatChip(model.upcomingDate)])
    default: return L10n.t("placeholderTask")
    }
  }

  private var chips: [(title: String, due: String?)] {
    switch model.view {
    case .today:
      return [
        (L10n.t("today"), Dates.todayIso()),
        (L10n.t("tomorrow"), Dates.tomorrowIso()),
        (L10n.t("noDate"), nil),
      ]
    case .inbox:
      return [
        (L10n.t("noDate"), nil),
        (L10n.t("today"), Dates.todayIso()),
        (L10n.t("tomorrow"), Dates.tomorrowIso()),
      ]
    case .upcoming:
      return [
        (Dates.formatChip(model.upcomingDate), model.upcomingDate),
        (L10n.t("today"), Dates.todayIso()),
        (L10n.t("noDate"), nil),
      ]
    default:
      return [(L10n.t("noDate"), nil), (L10n.t("today"), Dates.todayIso())]
    }
  }

  private var dateBinding: Binding<Date> {
    Binding(
      get: { Dates.parseIso(model.chipDue ?? model.upcomingDate) },
      set: { model.chipDue = Dates.iso($0) }
    )
  }

  private func chip(_ title: String, due: String?) -> some View {
    let on = model.chipDue == due
    return Button(title) {
      dismissKeyboard()
      model.chipDue = due
    }
      .font(.caption)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(on ? Color.blue.opacity(0.22) : Color.white.opacity(0.06), in: Capsule())
      .foregroundStyle(on ? Color.cyan : Color.secondary)
  }

  private var urgentIsCustom: Bool {
    guard let minutes = model.urgentMinutes else { return false }
    return minutes != 30 && minutes != 60 && minutes != 120
  }

  private var customUrgentTitle: String {
    guard urgentIsCustom, let minutes = model.urgentMinutes else { return L10n.t("urgentCustom") }
    let n = Int(minutes)
    if n < 60 { return L10n.t("urgentMin", n: n) }
    let hours = n / 60
    let rest = n % 60
    if rest == 0 { return L10n.t("urgentHour", ["h": String(hours)]) }
    return L10n.t("urgentHourMin", ["h": String(hours), "m": String(rest)])
  }

  private func urgentChip(_ title: String, minutes: Double) -> some View {
    let on = model.urgentMinutes == minutes
    return Button(title) {
      model.setDraftUrgent(minutes: minutes)
    }
      .font(.caption)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(on ? Color.orange.opacity(0.28) : Color.white.opacity(0.06), in: Capsule())
      .foregroundStyle(on ? Color.orange : Color.secondary)
  }

  private func urgentAlertChip(_ title: String, alert: String) -> some View {
    let on = model.urgentAlert == alert
    return Button(title) {
      model.urgentAlert = alert
    }
      .font(.caption)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(on ? Color.orange.opacity(0.28) : Color.white.opacity(0.06), in: Capsule())
      .foregroundStyle(on ? Color.orange : Color.secondary)
  }
}

struct TaskRow: View {
  @Environment(AppModel.self) private var model
  let task: TaskItem

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Button {
        model.complete(task.id)
      } label: {
        Circle()
          .strokeBorder(task.done ? Color.green : Color.white.opacity(0.38), lineWidth: 1.5)
          .background(Circle().fill(task.done ? Color.green : Color.clear))
          .frame(width: 22, height: 22)
          .overlay {
            if task.done {
              Image(systemName: "checkmark")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white)
            }
          }
      }
      .buttonStyle(.plain)
      VStack(alignment: .leading, spacing: 4) {
        Text(task.title)
          .strikethrough(task.done)
          .foregroundStyle(task.done ? .secondary : .primary)
        HStack(spacing: 6) {
          if task.next {
            Text(L10n.t("step")).font(.caption2).foregroundStyle(.cyan)
          }
          if task.later {
            Text(L10n.t("laterChip")).font(.caption2).foregroundStyle(.secondary)
          }
          Text(Dates.formatChip(task.due))
            .font(.caption2)
            .foregroundStyle(dueColor)
          if !task.note.isEmpty {
            Text(task.note).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
          }
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .onTapGesture { model.editingTask = task }
    .swipeActions(edge: .trailing) {
      Button(role: .destructive) { model.remove(task.id) } label: { Text(L10n.t("remove")) }
      Button { model.later(task.id) } label: { Text(L10n.t("notToday")) }
        .tint(.orange)
    }
    .swipeActions(edge: .leading) {
      Button { model.setDue(task.id, due: Dates.tomorrowIso()) } label: { Text(L10n.t("tomorrow")) }
        .tint(.indigo)
      if task.projectId != nil {
        Button { model.pinNext(task.id) } label: { Text(L10n.t("stepCap")) }
          .tint(.blue)
      }
    }
  }

  private var dueColor: Color {
    guard let due = task.due, !task.done else { return .secondary }
    if due < Dates.todayIso() { return .red }
    if due == Dates.todayIso() { return .cyan }
    return .secondary
  }
}

struct TaskEditSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let task: TaskItem
  @State private var title: String
  @State private var hasDue: Bool
  @State private var due: Date

  init(task: TaskItem) {
    self.task = task
    _title = State(initialValue: task.title)
    _hasDue = State(initialValue: task.due != nil)
    _due = State(initialValue: task.due.map(Dates.parseIso) ?? Date())
  }

  var body: some View {
    NavigationStack {
      Form {
        TextField(L10n.t("taskNoun"), text: $title, axis: .vertical)
          .lineLimit(2...8)
          .submitLabel(.done)
        Toggle(L10n.t("dueDate"), isOn: $hasDue)
        if hasDue {
          DatePicker(L10n.t("date"), selection: $due, displayedComponents: .date)
            .datePickerStyle(.graphical)
        }
      }
      .navigationTitle(L10n.t("taskNoun"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(L10n.t("close")) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(L10n.t("save")) {
            var patch = TaskPatch(title: title)
            if hasDue {
              patch.due = Dates.iso(due)
            } else {
              patch.clearDue = true
            }
            model.commit(Domain.patchTask(model.store, id: task.id, patch: patch))
            dismiss()
          }
          .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
      }
    }
  }
}

struct NextPromptView: View {
  @Environment(AppModel.self) private var model
  @State private var text = ""

  var body: some View {
    NavigationStack {
      let projectId = model.pendingNext ?? ""
      let project = model.store.projects.first { $0.id == projectId }
      let candidates = Selectors.nextCandidates(model.store, projectId: projectId)
      List {
        Section(L10n.t("nextFor", name: project?.name ?? "")) {
          ForEach(candidates) { task in
            Button(task.title) { model.pickNext(task.id) }
              .foregroundStyle(.primary)
          }
          HStack {
            TextField(L10n.t("writeStep"), text: $text)
            Button(L10n.t("ok")) { model.addNextFromPrompt(text); text = "" }
              .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
          }
          Button(L10n.t("skipStep")) { model.skipNext() }
            .foregroundStyle(.secondary)
        }
      }
      .navigationTitle(L10n.t("stepCap"))
      .navigationBarTitleDisplayMode(.inline)
    }
  }
}

struct ProjectListView: View {
  @Environment(AppModel.self) private var model
  @State private var draft = ""
  @State private var zoneId: String = "life"

  var body: some View {
    List {
      Section {
        Button {
          dismissKeyboard()
          model.resync()
        } label: {
          Label(model.syncStatus, systemImage: "arrow.triangle.2.circlepath")
        }
      }
      ForEach(Domain.listZones(model.store)) { zone in
        Section("\(zone.name) · \(zone.mode == "focus" ? L10n.t("step") : L10n.t("dates"))") {
          ForEach(Selectors.projectsInZone(model.store, zone: zone.id)) { project in
            NavigationLink {
              ProjectBoard(projectId: project.id)
            } label: {
              HStack {
                Circle().fill(Color(hex: project.color)).frame(width: 8, height: 8)
                VStack(alignment: .leading) {
                  Text(project.name)
                  if zone.mode == "focus" {
                    Text(Selectors.nextStep(model.store, projectId: project.id)?.title ?? L10n.t("needAStep"))
                      .font(.caption)
                      .foregroundStyle(.secondary)
                      .lineLimit(1)
                  }
                }
              }
            }
          }
        }
      }
      if !Selectors.archivedProjects(model.store).isEmpty {
        Section(L10n.t("archive")) {
          ForEach(Selectors.archivedProjects(model.store)) { project in
            HStack {
              Text(project.name)
              Spacer()
              Button(L10n.t("restore")) { model.restoreProject(project.id) }
            }
          }
        }
      }
      Section(L10n.t("newProject")) {
        Picker(L10n.t("section"), selection: $zoneId) {
          ForEach(Domain.listZones(model.store)) { zone in
            Text(zone.name).tag(zone.id)
          }
        }
        HStack {
          TextField(L10n.t("nameField"), text: $draft)
          Button(L10n.t("add")) {
            let result = Domain.createProject(model.store, name: draft, zone: zoneId)
            if result.1 != nil {
              model.commit(result.0)
              draft = ""
            }
          }
        }
      }
    }
    .navigationTitle(L10n.t("projects"))
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        LanguageToggle()
      }
    }
    .onAppear {
      if let first = Domain.listZones(model.store).first { zoneId = first.id }
    }
  }
}

struct ProjectBoard: View {
  @Environment(AppModel.self) private var model
  let projectId: String

  var body: some View {
    TaskBoardView()
      .onAppear { model.view = .project(projectId) }
      .onDisappear {
        if case .project = model.view { model.view = .all }
      }
  }
}

extension Color {
  init(hex: String) {
    var value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    if value.count == 6 { value = "FF" + value }
    var int: UInt64 = 0
    Scanner(string: value).scanHexInt64(&int)
    self.init(
      .sRGB,
      red: Double((int >> 16) & 0xFF) / 255,
      green: Double((int >> 8) & 0xFF) / 255,
      blue: Double(int & 0xFF) / 255,
      opacity: Double((int >> 24) & 0xFF) / 255
    )
  }
}

struct UrgentDurationSheet: View {
  @Environment(AppModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  @State private var hours = 0
  @State private var minutes = 15

  var body: some View {
    NavigationStack {
      HStack(spacing: 8) {
        Picker(L10n.t("urgentHourUnit"), selection: $hours) {
          ForEach(0..<24, id: \.self) { value in
            Text("\(value)").tag(value)
          }
        }
        .pickerStyle(.wheel)
        Text(L10n.t("urgentHourUnit"))
          .font(.headline)
          .foregroundStyle(.secondary)
        Picker(L10n.t("urgentMinUnit"), selection: $minutes) {
          ForEach(0..<60, id: \.self) { value in
            Text("\(value)").tag(value)
          }
        }
        .pickerStyle(.wheel)
        Text(L10n.t("urgentMinUnit"))
          .font(.headline)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 12)
      .navigationTitle(L10n.t("urgent"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(L10n.t("urgentStop")) {
            model.urgentMinutes = nil
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(L10n.t("doneKey")) {
            model.setDraftUrgent(hours: hours, minutes: minutes)
            dismiss()
          }
          .disabled(hours == 0 && minutes == 0)
        }
      }
    }
    .onAppear {
      let total = Int(model.urgentMinutes ?? 15)
      hours = min(23, total / 60)
      minutes = total % 60
    }
  }
}

struct LanguageToggle: View {
  @Environment(AppModel.self) private var model

  var body: some View {
    HStack(spacing: 0) {
      chip("RU", "ru")
      chip("EN", "en")
    }
    .padding(2)
    .background(Color.white.opacity(0.08), in: Capsule())
  }

  private func chip(_ label: String, _ code: String) -> some View {
    let on = model.locale == code
    return Button(label) {
      model.setLocale(code)
    }
    .font(.caption2.weight(.bold))
    .padding(.horizontal, 8)
    .padding(.vertical, 5)
    .background(on ? Color.white.opacity(0.16) : Color.clear, in: Capsule())
    .foregroundStyle(on ? Color.white : Color.secondary)
    .buttonStyle(.plain)
  }
}

private func dismissKeyboard() {
  UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}
