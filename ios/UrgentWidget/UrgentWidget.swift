import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct UrgentWidgetBundle: WidgetBundle {
  var body: some Widget {
    UrgentLiveActivity()
  }
}

struct UrgentLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: UrgentAttributes.self) { context in
      HStack(spacing: 12) {
        Image(systemName: "timer")
          .font(.title2.weight(.semibold))
          .foregroundStyle(.orange)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.state.title)
            .font(.headline)
            .lineLimit(1)
          Text("Urgent")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        UrgentTimerText(until: context.state.until)
          .font(.title.monospacedDigit().weight(.semibold))
      }
      .padding(16)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "timer")
            .foregroundStyle(.orange)
        }
        DynamicIslandExpandedRegion(.trailing) {
          UrgentTimerText(until: context.state.until)
            .font(.title3.monospacedDigit().weight(.semibold))
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text(context.state.title)
              .lineLimit(1)
            Spacer()
            Button(intent: DismissUrgentIntent()) {
              Text("Dismiss")
            }
          }
        }
      } compactLeading: {
        Image(systemName: "timer")
          .foregroundStyle(.orange)
      } compactTrailing: {
        UrgentTimerText(until: context.state.until)
          .font(.caption.monospacedDigit().weight(.semibold))
          .frame(minWidth: 40, maxWidth: 64)
          .minimumScaleFactor(0.7)
      } minimal: {
        Image(systemName: "timer")
          .foregroundStyle(.orange)
      }
    }
  }
}

struct UrgentTimerText: View {
  let until: Date

  var body: some View {
    Text(
      timerInterval: Date.now...until,
      countsDown: true,
      showsHours: until.timeIntervalSinceNow >= 3600
    )
    .monospacedDigit()
    .lineLimit(1)
    .multilineTextAlignment(.trailing)
  }
}
