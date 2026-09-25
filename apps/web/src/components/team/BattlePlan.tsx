import type { TeamRecommendation } from '@pickthree/engine';

/**
 * Three steps written only from what the engine produced: the lead's job (and its form change),
 * the top two switches, the closer's job (and the keep-a-shield advice). A step with nothing to
 * say is left out rather than filled in.
 */
export function BattlePlan({ team }: { team: TeamRecommendation }) {
  const e = team.explanation;
  const lead = [e.roleWhy.lead, e.slotDetail[0].formNote].filter((x): x is string => !!x);
  const switches = e.switchPlan.slice(0, 2).map((s) => s.line);
  const closer = [e.roleWhy.closer, e.slotDetail[2].keepShield?.line].filter(
    (x): x is string => !!x,
  );
  const steps = [
    { title: 'Lead', lines: lead },
    { title: 'Switch', lines: switches },
    { title: 'Closer', lines: closer },
  ].filter((st) => st.lines.length > 0);
  return (
    <ol className="plan">
      {steps.map((st) => (
        <li className="plan-step" key={st.title}>
          <span className="plan-title">{st.title}</span>
          {st.lines.map((l, i) => (
            <span className="plan-line" key={i}>
              {l}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
