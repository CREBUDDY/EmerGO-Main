import React from 'react';

export const DashboardGrid = React.memo(({ left, right }: { left: React.ReactNode, right: React.ReactNode }) => {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[300px_1fr] xl:grid-cols-[350px_1fr] gap-[16px] w-full min-h-0 items-start">
      <div id="LeftColumn" className="flex flex-col gap-[16px] w-full min-w-0">
        {left}
      </div>
      <div id="RightColumn" className="flex flex-col gap-[16px] w-full min-w-0">
        {right}
      </div>
    </div>
  );
});
