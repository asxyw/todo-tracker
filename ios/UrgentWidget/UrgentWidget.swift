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
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Urgent")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
          Text(context.state.title)
            .font(.headline)
            .lineLimit(1)
        }
        Spacer()
        Text(timerInterval: Date.now...context.state.until, countsDown: true)
          .font(.title3.monospacedDigit())
          .minimumScaleFactor(0.7)
      }
      .padding(14)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("Urgent")
            .font(.caption.weight(.semibold))
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(timerInterval: Date.now...context.state.until, countsDown: true)
            .monospacedDigit()
            .font(.caption.weight(.semibold))
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
        Text("GO")
          .font(.caption2.weight(.bold))
      } compactTrailing: {
        Text(timerInterval: Date.now...context.state.until, countsDown: true)
          .monospacedDigit()
          .font(.caption2)
          .frame(maxWidth: 52)
      } minimal: {
        Text(timerInterval: Date.now...context.state.until, countsDown: true)
          .monospacedDigit()
          .font(.caption2)
      }
    }
  }
}
